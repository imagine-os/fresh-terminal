/**
 * The voice seam. A provider turns microphone audio into a live transcript
 * (and, for realtime providers, an assistant voice + text). The composer only
 * knows this interface.
 */
export type VoiceProviderId = 'webspeech' | 'openai' | 'gemini';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface VoiceEvents {
  /** Live transcript of the person. isFinal = the segment is done. */
  onTranscriptDelta: (text: string, isFinal: boolean) => void;
  /** Assistant text (realtime providers). isFinal = the reply is done. */
  onAssistantText: (text: string, isFinal: boolean) => void;
  /** Remote audio to play, or null when the session ends. */
  onAssistantAudio: (stream: MediaStream | null) => void;
  /** Microphone level 0..1 for the waveform. */
  onLevel: (level: number) => void;
  onState: (state: VoiceState) => void;
  onError: (message: string) => void;
}

export interface VoiceSessionSummary {
  provider: VoiceProviderId;
  model: string;
  startedAt: number;
  endedAt: number;
  seconds: number;
}

export interface VoiceProvider {
  readonly id: VoiceProviderId;
  start(): Promise<void>;
  stop(): Promise<VoiceSessionSummary | null>;
  setMuted(muted: boolean): void;
}

export interface RealtimeProviderInfo {
  id: 'openai' | 'gemini';
  configured: boolean;
  model: string;
  transcribe_model?: string;
  price: { audio_in_micro_per_minute: number; audio_out_micro_per_minute: number; estimate: boolean } | null;
}
