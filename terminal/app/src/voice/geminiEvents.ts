import type { VoiceEvents } from './types';

/**
 * Pure mapping from Gemini Live server messages to the voice seam.
 * Shapes verified 2026-09-29 (Live API WebSocket guide):
 *   { setupComplete: {} }
 *   { serverContent: { inputTranscription: { text }, outputTranscription: { text },
 *                      modelTurn: { parts: [{ inlineData: { mimeType, data } }] }, turnComplete, interrupted } }
 */
export interface GeminiMessage {
  setupComplete?: Record<string, never>;
  serverContent?: {
    inputTranscription?: { text?: string; finished?: boolean };
    outputTranscription?: { text?: string; finished?: boolean };
    modelTurn?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
  error?: { message?: string };
}

export interface GeminiAudioSink {
  onAudioChunk: (base64Pcm24k: string) => void;
}

export function handleGeminiMessage(
  message: GeminiMessage,
  events: Pick<VoiceEvents, 'onTranscriptDelta' | 'onAssistantText' | 'onError' | 'onState'>,
  audio?: GeminiAudioSink,
): void {
  if (message.setupComplete) {
    events.onState('listening');
    return;
  }
  if (message.error) {
    events.onError(message.error.message ?? 'live error');
    return;
  }
  const content = message.serverContent;
  if (!content) {
    return;
  }
  if (content.inputTranscription?.text) {
    events.onTranscriptDelta(content.inputTranscription.text, Boolean(content.inputTranscription.finished));
  }
  if (content.outputTranscription?.text) {
    events.onState('speaking');
    events.onAssistantText(content.outputTranscription.text, false);
  }
  for (const part of content.modelTurn?.parts ?? []) {
    if (part.inlineData?.data && audio) {
      audio.onAudioChunk(part.inlineData.data);
    }
  }
  if (content.turnComplete) {
    events.onAssistantText('', true);
    events.onState('listening');
  }
}
