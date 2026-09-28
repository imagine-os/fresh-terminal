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
  { id: 'tagger.model', label: 'Model-based chip tagger (JEV tier)' },
  { id: 'billing.stripe', label: 'Stripe settlement' },
  { id: 'chain.shared.publish', label: 'Publishing the shared chain outside this browser' },
  { id: 'presence.others', label: 'Presence of other people in a box' },
  { id: 'canvas.document', label: 'Canvas document model rendering' },
  { id: 'voice.control', label: 'Voice controller / TV remote input' },
] as const;
