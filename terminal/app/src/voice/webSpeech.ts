import { LevelMeter } from './level';
import type { VoiceEvents, VoiceProvider, VoiceSessionSummary } from './types';

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Browser speech recognition. No key, no server. Interim results stream as
 * gray text; finals solidify into the composer text (and then chips).
 */
export class WebSpeechVoice implements VoiceProvider {
  readonly id = 'webspeech' as const;
  private recognition: SpeechRecognitionLike | null = null;
  private stream: MediaStream | null = null;
  private readonly meter = new LevelMeter();
  private startedAt = 0;
  private stopping = false;

  constructor(
    private readonly lang: string,
    private readonly events: VoiceEvents,
  ) {}

  async start(): Promise<void> {
    const Ctor = speechRecognitionCtor();
    if (Ctor === null) {
      this.events.onError('speech recognition not available');
      this.events.onState('error');
      return;
    }
    this.events.onState('connecting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.meter.start(this.stream, this.events.onLevel);
    } catch {
      this.stream = null;
    }
    const recognition = new Ctor();
    recognition.lang = this.lang === 'es' ? 'es-ES' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result) {
          this.events.onTranscriptDelta(result[0].transcript, result.isFinal);
        }
      }
    };
    recognition.onend = () => {
      if (!this.stopping && this.recognition === recognition) {
        // Browsers end continuous sessions after silence; keep listening.
        try {
          recognition.start();
          return;
        } catch {
          // fall through to idle
        }
      }
      this.events.onState('idle');
    };
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      // A real error ends the session: no restart loop, one line, state error (C-090).
      this.stopping = true;
      const code = event.error ?? 'speech error';
      const why =
        code === 'network'
          ? 'the browser could not reach its speech service (network). Chrome and Edge need Google\'s service; Safari and Firefox have none. Try again, or switch the voice provider in Settings.'
          : code === 'not-allowed' || code === 'service-not-allowed'
            ? 'microphone access was refused. Allow the mic for this site and try again.'
            : code === 'audio-capture'
              ? 'no microphone was found.'
              : code;
      this.events.onError(why);
      this.events.onState('error');
      try {
        recognition.stop();
      } catch {
        // already stopped
      }
      this.recognition = null;
      this.meter.stop();
      for (const track of this.stream?.getTracks() ?? []) {
        track.stop();
      }
      this.stream = null;
      this.events.onLevel(0);
    };
    this.recognition = recognition;
    this.startedAt = Date.now();
    this.stopping = false;
    recognition.start();
    this.events.onState('listening');
  }

  async stop(): Promise<VoiceSessionSummary | null> {
    this.stopping = true;
    this.recognition?.stop();
    this.recognition = null;
    this.meter.stop();
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
    this.events.onLevel(0);
    this.events.onState('idle');
    if (this.startedAt === 0) {
      return null;
    }
    const endedAt = Date.now();
    return { provider: 'webspeech', model: 'browser', startedAt: this.startedAt, endedAt, seconds: Math.round((endedAt - this.startedAt) / 1000) };
  }

  setMuted(muted: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
  }
}
