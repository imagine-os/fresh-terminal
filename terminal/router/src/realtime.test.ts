import { describe, expect, it } from 'vitest';
import { GEMINI_AUTH_TOKENS_URL, OPENAI_CLIENT_SECRETS_URL, isMintFailure, mintGeminiSession, mintOpenAISession } from './realtime';

describe('mintOpenAISession', () => {
  it('posts the session shape with input transcription and returns the secret value', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const fakeFetch: typeof fetch = async (u, i) => {
      url = String(u);
      init = i;
      return new Response(JSON.stringify({ value: 'ek_test', expires_at: 1_800_000_000 }), { status: 200 });
    };
    const session = await mintOpenAISession('sk-server', 'gpt-realtime-2.1', 'gpt-live-transcribe', { fetchImpl: fakeFetch });
    expect(url).toBe(OPENAI_CLIENT_SECRETS_URL);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-server');
    const body = JSON.parse(String(init?.body)) as { session: { type: string; model: string; audio: { input: { transcription: { model: string } } } } };
    expect(body.session.type).toBe('realtime');
    expect(body.session.model).toBe('gpt-realtime-2.1');
    expect(body.session.audio.input.transcription.model).toBe('gpt-live-transcribe');
    expect(session).toMatchObject({ provider: 'openai', value: 'ek_test', expires_at: 1_800_000_000, sdp_url: 'https://api.openai.com/v1/realtime/calls' });
  });

  it('reports provider failures without throwing', async () => {
    const bad: typeof fetch = async () => new Response('{"error":"nope"}', { status: 401 });
    const result = await mintOpenAISession('k', 'm', 't', { fetchImpl: bad });
    expect(isMintFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(401);
  });
});

describe('mintGeminiSession', () => {
  it('creates a single-use token with live constraints and transcription enabled', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const fakeFetch: typeof fetch = async (u, i) => {
      url = String(u);
      init = i;
      return new Response(JSON.stringify({ name: 'auth_tokens/abc' }), { status: 200 });
    };
    const session = await mintGeminiSession('g-key', 'gemini-3.8-live', { fetchImpl: fakeFetch, now: () => 1_790_000_000_000 });
    expect(url).toBe(GEMINI_AUTH_TOKENS_URL);
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('g-key');
    const body = JSON.parse(String(init?.body)) as { uses: number; expireTime: string; liveConnectConstraints: { model: string; config: { inputAudioTranscription: object } } };
    expect(body.uses).toBe(1);
    expect(body.expireTime).toBe(new Date(1_790_000_000_000 + 30 * 60_000).toISOString());
    expect(body.liveConnectConstraints.model).toBe('models/gemini-3.8-live');
    expect(body.liveConnectConstraints.config.inputAudioTranscription).toEqual({});
    expect(session).toMatchObject({ provider: 'gemini', token: 'auth_tokens/abc', ws_url: expect.stringContaining('BidiGenerateContentConstrained') });
  });
});
