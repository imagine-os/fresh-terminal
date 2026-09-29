import { ROUTER_URL } from '../lib/routerClient';
import { routerFetch } from '../lib/routerFetch';
import { LevelMeter } from './level';
import { handleOpenAIEvent, type OpenAIEvent } from './openaiEvents';
import type { VoiceEvents, VoiceProvider, VoiceSessionSummary } from './types';

interface SessionResponse {
  provider: 'openai';
  value: string;
  model: string;
  transcribe_model: string;
  sdp_url: string;
}

/**
 * OpenAI Realtime over WebRTC. The router mints an ephemeral client secret
 * (POST /realtime/session?provider=openai); the browser does the SDP exchange
 * with https://api.openai.com/v1/realtime/calls and listens on the
 * "oai-events" data channel. Remote audio arrives as a track.
 */
export class OpenAIRealtimeVoice implements VoiceProvider {
  readonly id = 'openai' as const;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private readonly meter = new LevelMeter();
  private startedAt = 0;
  private model = '';

  constructor(
    private readonly events: VoiceEvents,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async start(): Promise<void> {
    this.events.onState('connecting');
    let session: SessionResponse;
    try {
      const response = await routerFetch(`${ROUTER_URL}/realtime/session?provider=openai`, { method: 'POST' }, { paid: true, fetchImpl: this.fetchImpl });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `router ${response.status}`);
      }
      session = (await response.json()) as SessionResponse;
    } catch (error) {
      this.events.onError(error instanceof Error ? error.message : String(error));
      this.events.onState('error');
      return;
    }
    this.model = session.model;

    try {
      const pc = new RTCPeerConnection();
      this.pc = pc;
      pc.ontrack = (event) => {
        const remote = event.streams[0];
        if (remote) {
          this.events.onAssistantAudio(remote);
        }
      };
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of this.stream.getTracks()) {
        pc.addTrack(track, this.stream);
      }
      this.meter.start(this.stream, this.events.onLevel);

      const channel = pc.createDataChannel('oai-events');
      this.channel = channel;
      channel.addEventListener('open', () => {
        channel.send(
          JSON.stringify({
            type: 'session.update',
            session: { type: 'realtime', audio: { input: { transcription: { model: session.transcribe_model } } } },
          }),
        );
        this.events.onState('listening');
      });
      channel.addEventListener('message', (message) => {
        try {
          handleOpenAIEvent(JSON.parse(String(message.data)) as OpenAIEvent, this.events);
        } catch {
          // ignore malformed frames
        }
      });
      channel.addEventListener('close', () => this.events.onState('idle'));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await this.fetchImpl(session.sdp_url, {
        method: 'POST',
        body: offer.sdp ?? '',
        headers: { Authorization: `Bearer ${session.value}`, 'Content-Type': 'application/sdp' },
      });
      if (!sdpResponse.ok) {
        throw new Error(`OpenAI SDP ${sdpResponse.status}`);
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() });
      this.startedAt = Date.now();
    } catch (error) {
      this.events.onError(error instanceof Error ? error.message : String(error));
      this.events.onState('error');
      await this.stop();
    }
  }

  async stop(): Promise<VoiceSessionSummary | null> {
    this.channel?.close();
    this.channel = null;
    this.pc?.close();
    this.pc = null;
    this.meter.stop();
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
    this.events.onAssistantAudio(null);
    this.events.onLevel(0);
    this.events.onState('idle');
    if (this.startedAt === 0) {
      return null;
    }
    const endedAt = Date.now();
    const summary: VoiceSessionSummary = {
      provider: 'openai',
      model: this.model,
      startedAt: this.startedAt,
      endedAt,
      seconds: Math.max(1, Math.round((endedAt - this.startedAt) / 1000)),
    };
    this.startedAt = 0;
    return summary;
  }

  setMuted(muted: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
  }
}
