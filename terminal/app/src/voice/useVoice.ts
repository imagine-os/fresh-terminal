import { useCallback, useEffect, useRef, useState } from 'react';
import { createVoiceProvider, type VoiceProvider, type VoiceProviderId, type VoiceSessionSummary, type VoiceState } from './index';

export interface UseVoiceOptions {
  providerId: VoiceProviderId;
  lang: string;
  onFinalTranscript: (text: string) => void;
  onAssistantText: (text: string, isFinal: boolean) => void;
  onSessionEnd: (summary: VoiceSessionSummary) => void;
  onError: (message: string) => void;
}

export interface VoiceControls {
  state: VoiceState;
  level: number;
  interim: string;
  muted: boolean;
  active: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  setMuted: (muted: boolean) => void;
  audioRef: (element: HTMLAudioElement | null) => void;
}

/** Owns one voice provider at a time and exposes what the composer renders. */
export function useVoice(options: UseVoiceOptions): VoiceControls {
  const [state, setState] = useState<VoiceState>('idle');
  const [level, setLevel] = useState(0);
  const [interim, setInterim] = useState('');
  const [muted, setMutedState] = useState(false);
  const provider = useRef<VoiceProvider | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const stop = useCallback(() => {
    const current = provider.current;
    provider.current = null;
    setInterim('');
    if (current) {
      void current.stop().then((summary) => {
        if (summary) {
          latest.current.onSessionEnd(summary);
        }
      });
    }
  }, []);

  const start = useCallback(() => {
    if (provider.current) {
      return;
    }
    const created = createVoiceProvider(latest.current.providerId, latest.current.lang, {
      onTranscriptDelta: (text, isFinal) => {
        if (isFinal) {
          setInterim('');
          if (text.trim()) {
            latest.current.onFinalTranscript(text.trim());
          }
        } else {
          setInterim(latest.current.providerId === 'webspeech' ? text : (previous) => previous + text);
        }
      },
      onAssistantText: (text, isFinal) => latest.current.onAssistantText(text, isFinal),
      onAssistantAudio: (stream) => {
        if (audio.current) {
          audio.current.srcObject = stream;
          if (stream) {
            void audio.current.play().catch(() => undefined);
          }
        }
      },
      onLevel: setLevel,
      onState: setState,
      onError: (message) => latest.current.onError(message),
    });
    provider.current = created;
    void created.start();
  }, []);

  const toggle = useCallback(() => {
    if (provider.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    provider.current?.setMuted(value);
    if (audio.current) {
      audio.current.muted = value;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    state,
    level,
    interim,
    muted,
    active: provider.current !== null && state !== 'idle' && state !== 'error',
    start,
    stop,
    toggle,
    setMuted,
    audioRef: (element) => {
      audio.current = element;
    },
  };
}
