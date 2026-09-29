import { describe, expect, it } from 'vitest';
import { handleGeminiMessage } from './geminiEvents';
import { handleOpenAIEvent } from './openaiEvents';

function sink() {
  const transcript: Array<[string, boolean]> = [];
  const assistant: Array<[string, boolean]> = [];
  const states: string[] = [];
  const errors: string[] = [];
  return {
    transcript,
    assistant,
    states,
    errors,
    events: {
      onTranscriptDelta: (text: string, isFinal: boolean) => transcript.push([text, isFinal]),
      onAssistantText: (text: string, isFinal: boolean) => assistant.push([text, isFinal]),
      onState: (state: string) => states.push(state),
      onError: (message: string) => errors.push(message),
    },
  };
}

describe('handleOpenAIEvent', () => {
  it('streams the live input transcript and finalises it', () => {
    const s = sink();
    handleOpenAIEvent({ type: 'conversation.item.input_audio_transcription.delta', delta: 'sched' }, s.events as never);
    handleOpenAIEvent({ type: 'conversation.item.input_audio_transcription.delta', delta: 'ule a call' }, s.events as never);
    handleOpenAIEvent({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'schedule a call' }, s.events as never);
    expect(s.transcript).toEqual([['sched', false], ['ule a call', false], ['schedule a call', true]]);
  });

  it('maps assistant transcript/text deltas and completion, and errors', () => {
    const s = sink();
    handleOpenAIEvent({ type: 'response.output_audio_transcript.delta', delta: 'Sure' }, s.events as never);
    handleOpenAIEvent({ type: 'response.output_audio_transcript.done', transcript: 'Sure, done.' }, s.events as never);
    handleOpenAIEvent({ type: 'response.done' }, s.events as never);
    handleOpenAIEvent({ type: 'error', error: { message: 'bad' } }, s.events as never);
    expect(s.assistant).toEqual([['Sure', false], ['Sure, done.', true]]);
    expect(s.states).toEqual(['speaking', 'listening']);
    expect(s.errors).toEqual(['bad']);
  });
});

describe('handleGeminiMessage', () => {
  it('maps setup, input/output transcription, audio parts and turn completion', () => {
    const s = sink();
    const chunks: string[] = [];
    handleGeminiMessage({ setupComplete: {} }, s.events as never);
    handleGeminiMessage({ serverContent: { inputTranscription: { text: 'hola' } } }, s.events as never);
    handleGeminiMessage(
      { serverContent: { outputTranscription: { text: 'Hola.' }, modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAAA' } }] } } },
      s.events as never,
      { onAudioChunk: (data) => chunks.push(data) },
    );
    handleGeminiMessage({ serverContent: { turnComplete: true } }, s.events as never);
    expect(s.states[0]).toBe('listening');
    expect(s.transcript).toEqual([['hola', false]]);
    expect(s.assistant).toEqual([['Hola.', false], ['', true]]);
    expect(chunks).toEqual(['AAAA']);
  });
});
