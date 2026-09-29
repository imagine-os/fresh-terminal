export class NotWiredError extends Error {
  constructor(what: string) {
    super(`Not wired yet: ${what}`);
    this.name = 'NotWiredError';
  }
}

/** Everything that is visible but not functional in this pass. */
export const NOT_WIRED = [
  { id: 'auth.clerk', label: 'Clerk sign-in (save / sign in button)' },
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
