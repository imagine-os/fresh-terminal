import { ROUTER_URL } from '../lib/routerClient';
import { routerFetch } from '../lib/routerFetch';
import { NotWiredError } from '../lib/notWired';
import { handleGeminiMessage, type GeminiMessage } from './geminiEvents';
import type { VoiceEvents, VoiceProvider, VoiceSessionSummary } from './types';

interface SessionResponse {
  provider: 'gemini';
  token: string;
  model: string;
  ws_url: string;
}

/**
 * Gemini Live over WebSocket. NOT WIRED YET for audio: this skeleton mints the
 * ephemeral token through the router, opens the constrained WebSocket, sends
 * the setup message and maps transcription events. Capturing 16 kHz PCM from
 * the microphone and playing 24 kHz PCM back are the pass-4 pieces; until then
 * start() reports the state and stops.
 */
export class GeminiLiveVoice implements VoiceProvider {
  readonly id = 'gemini' as const;
  readonly wired = false;
  private socket: WebSocket | null = null;

  constructor(
    private readonly events: VoiceEvents,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async connect(): Promise<WebSocket> {
    const response = await routerFetch(`${ROUTER_URL}/realtime/session?provider=gemini`, { method: 'POST' }, { paid: true, fetchImpl: this.fetchImpl });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `router ${response.status}`);
    }
    const session = (await response.json()) as SessionResponse;
    const socket = new WebSocket(`${session.ws_url}?access_token=${encodeURIComponent(session.token)}`);
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          setup: {
            model: `models/${session.model}`,
            generationConfig: { responseModalities: ['AUDIO'] },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }),
      );
    });
    socket.addEventListener('message', (message) => {
      try {
        handleGeminiMessage(JSON.parse(String(message.data)) as GeminiMessage, this.events);
      } catch {
        // ignore malformed frames
      }
    });
    this.socket = socket;
    return socket;
  }

  async start(): Promise<void> {
    this.events.onError(new NotWiredError('Gemini Live audio capture and playback').message);
    this.events.onState('error');
  }

  async stop(): Promise<VoiceSessionSummary | null> {
    this.socket?.close();
    this.socket = null;
    this.events.onState('idle');
    return null;
  }

  setMuted(): void {
    // no microphone stream yet
  }
}
