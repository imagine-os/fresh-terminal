import { useSyncExternalStore } from 'react';
import { auth } from '../auth';
import { LocalStore } from './local';
import { spacetimeConfigured } from './spacetime';
import type { Store, StoreSnapshot } from './types';

/**
 * The store used by the app. Always the local fallback in pass 1; the dev
 * panel says whether SpacetimeDB env vars are present but unused.
 */
export const store: Store = new LocalStore(auth.currentUser().id);
export const spacetimeEnvPresent = spacetimeConfigured();

export function useStoreSnapshot(): StoreSnapshot {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
}

export type { Box, Line, LineKind, LineOptions, Owner, Presence, RouteRule, Session, Store, StoreSnapshot } from './types';
