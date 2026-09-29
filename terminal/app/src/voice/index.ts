import { GeminiLiveVoice } from './geminiLive';
import { OpenAIRealtimeVoice } from './openaiRealtime';
import type { VoiceEvents, VoiceProvider, VoiceProviderId } from './types';
import { WebSpeechVoice, speechRecognitionCtor } from './webSpeech';

export * from './types';
export { handleOpenAIEvent } from './openaiEvents';
export { handleGeminiMessage } from './geminiEvents';
export { speechRecognitionCtor };

export function createVoiceProvider(id: VoiceProviderId, lang: string, events: VoiceEvents): VoiceProvider {
  switch (id) {
    case 'openai':
      return new OpenAIRealtimeVoice(events);
    case 'gemini':
      return new GeminiLiveVoice(events);
    default:
      return new WebSpeechVoice(lang, events);
  }
}

export const VOICE_PROVIDERS: Array<{ id: VoiceProviderId; label: string; realtime: boolean; wired: boolean }> = [
  { id: 'webspeech', label: 'Browser speech (no key)', realtime: false, wired: true },
  { id: 'openai', label: 'OpenAI Realtime', realtime: true, wired: true },
  { id: 'gemini', label: 'Gemini Live', realtime: true, wired: false },
];
