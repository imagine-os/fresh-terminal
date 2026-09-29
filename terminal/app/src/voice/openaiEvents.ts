import type { VoiceEvents } from './types';

/**
 * Pure mapping from OpenAI Realtime server events to the voice seam.
 * Event names verified 2026-09-29 (Realtime transcription guide):
 *   conversation.item.input_audio_transcription.delta   { item_id, content_index, delta }
 *   conversation.item.input_audio_transcription.completed { item_id, content_index, transcript }
 *   response.output_audio_transcript.delta / .done       { delta } / { transcript }
 *   response.output_text.delta / .done                   { delta } / { text }
 */
export interface OpenAIEvent {
  type: string;
  delta?: string;
  transcript?: string;
  text?: string;
  error?: { message?: string };
}

export function handleOpenAIEvent(event: OpenAIEvent, events: Pick<VoiceEvents, 'onTranscriptDelta' | 'onAssistantText' | 'onError' | 'onState'>): void {
  switch (event.type) {
    case 'conversation.item.input_audio_transcription.delta':
      events.onTranscriptDelta(event.delta ?? '', false);
      return;
    case 'conversation.item.input_audio_transcription.completed':
      events.onTranscriptDelta(event.transcript ?? '', true);
      return;
    case 'response.output_audio_transcript.delta':
    case 'response.output_text.delta':
      events.onState('speaking');
      events.onAssistantText(event.delta ?? '', false);
      return;
    case 'response.output_audio_transcript.done':
      events.onAssistantText(event.transcript ?? '', true);
      return;
    case 'response.output_text.done':
      events.onAssistantText(event.text ?? '', true);
      return;
    case 'response.done':
    case 'output_audio_buffer.stopped':
      events.onState('listening');
      return;
    case 'error':
      events.onError(event.error?.message ?? 'realtime error');
      return;
    default:
      return;
  }
}
