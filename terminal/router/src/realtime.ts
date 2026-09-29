/**
 * Ephemeral credentials for realtime voice. The long-lived provider keys stay
 * on the router; the browser receives a short-lived secret and talks to the
 * provider directly (WebRTC for OpenAI, WebSocket for Gemini).
 *
 * Verified 2026-09-29:
 *  OpenAI: POST https://api.openai.com/v1/realtime/client_secrets
 *          body { session: { type: 'realtime', model, audio: { input: { transcription: { model } }, output: { voice } } } }
 *          -> { value, expires_at, session }. Browser: POST https://api.openai.com/v1/realtime/calls (application/sdp).
 *          Transcription events: conversation.item.input_audio_transcription.delta / .completed.
 *  Gemini: POST https://generativelanguage.googleapis.com/v1beta/auth_tokens (x-goog-api-key)
 *          body { uses, expireTime, newSessionExpireTime, liveConnectConstraints } -> { name }.
 *          Browser: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=<name>
 */
export const OPENAI_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';
export const OPENAI_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
export const OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1';
export const OPENAI_TRANSCRIBE_MODEL = 'gpt-live-transcribe';

export const GEMINI_AUTH_TOKENS_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
export const GEMINI_LIVE_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
export const GEMINI_LIVE_MODEL = 'gemini-3.8-live';

export type RealtimeProvider = 'openai' | 'gemini';

export interface OpenAISession {
  provider: 'openai';
  value: string;
  expires_at: number | null;
  model: string;
  transcribe_model: string;
  sdp_url: string;
}

export interface GeminiSession {
  provider: 'gemini';
  token: string;
  model: string;
  ws_url: string;
  expires_at: string;
}

export type RealtimeSession = OpenAISession | GeminiSession;

export interface MintOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  instructions?: string;
  voice?: string;
}

export interface MintFailure {
  status: number;
  message: string;
}

export async function mintOpenAISession(
  apiKey: string,
  model: string,
  transcribeModel: string,
  options: MintOptions = {},
): Promise<RealtimeSession | MintFailure> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(OPENAI_CLIENT_SECRETS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model,
        instructions: options.instructions ?? 'You are the voice of a prompt-first terminal. Reply briefly and plainly.',
        audio: {
          input: { transcription: { model: transcribeModel } },
          output: { voice: options.voice ?? 'marin' },
        },
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { status: response.status, message: `OpenAI ${response.status}: ${text.slice(0, 200)}` };
  }
  const body = (await response.json()) as { value?: string; expires_at?: number };
  if (!body.value) {
    return { status: 502, message: 'OpenAI returned no client secret value' };
  }
  return {
    provider: 'openai',
    value: body.value,
    expires_at: typeof body.expires_at === 'number' ? body.expires_at : null,
    model,
    transcribe_model: transcribeModel,
    sdp_url: OPENAI_CALLS_URL,
  };
}

export async function mintGeminiSession(apiKey: string, model: string, options: MintOptions = {}): Promise<RealtimeSession | MintFailure> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = (options.now ?? Date.now)();
  const expireTime = new Date(now + 30 * 60_000).toISOString();
  const newSessionExpireTime = new Date(now + 2 * 60_000).toISOString();
  const response = await fetchImpl(GEMINI_AUTH_TOKENS_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      expireTime,
      newSessionExpireTime,
      liveConnectConstraints: {
        model: `models/${model}`,
        config: {
          responseModalities: ['AUDIO'],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { status: response.status, message: `Gemini ${response.status}: ${text.slice(0, 200)}` };
  }
  const body = (await response.json()) as { name?: string };
  if (!body.name) {
    return { status: 502, message: 'Gemini returned no token name' };
  }
  return { provider: 'gemini', token: body.name, model, ws_url: GEMINI_LIVE_WS_URL, expires_at: expireTime };
}

export function isMintFailure(value: RealtimeSession | MintFailure): value is MintFailure {
  return 'status' in value && 'message' in value;
}
