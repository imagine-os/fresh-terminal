import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimal typing for the Web Speech API (not in lib.dom for every target). */
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
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech(lang: string, onText: (text: string, final: boolean) => void) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setAvailable(getCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
    recognition.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (Ctor === null) {
      return;
    }
    const instance = new Ctor();
    instance.lang = lang === 'es' ? 'es-ES' : 'en-US';
    instance.continuous = false;
    instance.interimResults = true;
    instance.onresult = (event) => {
      let text = '';
      let final = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result) {
          text += result[0].transcript;
          final = final || result.isFinal;
        }
      }
      onText(text, final);
    };
    instance.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    instance.onerror = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = instance;
    setListening(true);
    instance.start();
  }, [lang, onText]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  return { available, listening, toggle, stop };
}
