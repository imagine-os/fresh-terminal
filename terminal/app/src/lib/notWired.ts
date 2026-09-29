export class NotWiredError extends Error {
  constructor(what: string) {
    super(`Not wired yet: ${what}`);
    this.name = 'NotWiredError';
  }
}

/** Everything that is visible but not functional in this pass. */
export const NOT_WIRED = [
  { id: 'auth.clerk.production', label: 'Clerk production instance on freshterminal.ai (a development instance is in use: dev badge, 100-user cap)' },
  { id: 'auth.clerk.es', label: 'Clerk sign-in screens in Spanish (Clerk UI is English only for now)' },
  { id: 'sync.lines', label: 'Transcript lines in cloud sync (boxes, menus, pages, looks and the ledger mirror sync; lines stay in this browser)' },
  { id: 'credits.turnstile', label: 'Cloudflare Turnstile bot check before the first free call (the API token has no Turnstile permission; free credits rely on signed device ids, IP and network limits and a daily cap)' },
  { id: 'credits.buy', label: 'Buying more credits (Stripe); signed-in accounts get $1 free, then your own key' },
  { id: 'sync.realtime', label: 'Realtime sync between devices (sync runs on sign-in, after edits and on focus; last writer wins)' },
  { id: 'store.spacetimedb', label: 'SpacetimeDB live store (module written, not published)' },
  { id: 'billing.stripe', label: 'Stripe settlement' },
  { id: 'chain.shared.publish', label: 'Publishing the shared chain outside this browser' },
  { id: 'presence.others', label: 'Presence of other people in a box' },
  { id: 'canvas.document', label: 'Canvas document model rendering' },
  { id: 'voice.gemini.audio', label: 'Gemini Live audio capture and playback (token + transcript events exist)' },
  { id: 'voice.usage.pricing', label: 'Realtime voice priced from real usage (entries are estimates)' },
  { id: 'voice.control', label: 'Voice controller over the actions registry / TV remote input' },
  { id: 'playback.branch', label: 'Branching and merging a session from a replay step (the timeline stores parent ids for it)' },
  { id: 'playback.media', label: 'Audio and video in the replay (steps only today)' },
] as const;
