import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ROUTER_URL } from '../lib/routerClient';
import { setSessionTokenProvider } from '../lib/routerFetch';
import { store } from '../store';
import { CloudSync, type SyncStatus } from '../sync/cloud';
import { currentClerkAppearance, useClerkAppearance } from './clerkAppearance';
import { CLERK_PUBLISHABLE_KEY, clerkEnabled, clerkInstanceKind } from './clerkConfig';

/**
 * Anonymous-first accounts (2026-09-29). Everyone starts signed out with a
 * per-browser identity and localStorage boxes. Signing in with Clerk keeps
 * that working and adds cloud sync (boxes + ledger mirror in D1 via the
 * router). No Clerk key in the build = no sign-in, clearly labelled.
 */
export interface AccountValue {
  /** A Clerk key is in this build. */
  available: boolean;
  instance: 'development' | 'production' | 'none';
  loaded: boolean;
  signedIn: boolean;
  userId: string | null;
  name: string | null;
  sync: SyncStatus;
  signIn: () => void;
  signOut: () => void;
  syncNow: () => void;
}

const noop = () => undefined;

const SIGNED_OUT: AccountValue = {
  available: false,
  instance: 'none',
  loaded: true,
  signedIn: false,
  userId: null,
  name: null,
  sync: { state: 'off' },
  signIn: noop,
  signOut: noop,
  syncNow: noop,
};

const AccountContext = createContext<AccountValue>(SIGNED_OUT);

export function useAccount(): AccountValue {
  return useContext(AccountContext);
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const clerk = useClerk();
  const { user } = useUser();
  const [sync, setSync] = useState<SyncStatus>({ state: 'off' });
  const engine = useRef<CloudSync | null>(null);
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  // The Sign in action (ft:action auth.signIn) opens Clerk from anywhere: a reply, the tray, voice.
  useEffect(() => {
    const onAction = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id === 'auth.signIn') clerk.openSignIn({ appearance: currentClerkAppearance() });
      if (id === 'auth.signOut') void clerk.signOut();
      if (id === 'sync.now') void engine.current?.sync();
      // C-093: Clerk Billing's refill plans live in the profile window's Billing tab.
      if (id === 'billing.open') clerk.openUserProfile({});
    };
    window.addEventListener('ft:action', onAction);
    return () => window.removeEventListener('ft:action', onAction);
  }, [clerk]);

  // Paid router calls carry the session token when signed in, so the account's credits are used.
  useEffect(() => {
    setSessionTokenProvider(isLoaded && isSignedIn ? () => tokenRef.current() : null);
    window.dispatchEvent(new CustomEvent('ft:credits-changed'));
    return () => setSessionTokenProvider(null);
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) {
      engine.current = null;
      setSync({ state: 'off' });
      return;
    }
    const cloud = new CloudSync({
      routerUrl: ROUTER_URL,
      userId,
      getToken: () => tokenRef.current(),
      source: {
        syncBoxes: () => store.syncBoxes(),
        importSyncBoxes: (rows) => store.importSyncBoxes(rows),
        entries: () => store.getSnapshot().entries,
      },
      onStatus: setSync,
    });
    engine.current = cloud;
    void cloud.sync();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void cloud.sync(), 2000);
    });
    const onFocus = () => void cloud.sync();
    window.addEventListener('focus', onFocus);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      engine.current = null;
    };
  }, [isLoaded, isSignedIn, userId]);

  const value = useMemo<AccountValue>(
    () => ({
      available: true,
      instance: clerkInstanceKind(),
      loaded: isLoaded,
      signedIn: Boolean(isSignedIn),
      userId: userId ?? null,
      name: user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? null,
      sync,
      signIn: () => clerk.openSignIn({ appearance: currentClerkAppearance() }),
      signOut: () => void clerk.signOut(),
      syncNow: () => void engine.current?.sync(),
    }),
    [clerk, isLoaded, isSignedIn, user, userId, sync],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  if (!clerkEnabled()) {
    return <AccountContext.Provider value={SIGNED_OUT}>{children}</AccountContext.Provider>;
  }
  return <ThemedClerk>{children}</ThemedClerk>;
}

/** Clerk in our look, following the active theme (see clerkAppearance.ts). */
function ThemedClerk({ children }: { children: ReactNode }) {
  const appearance = useClerkAppearance();
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl={import.meta.env.BASE_URL} appearance={appearance}>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}
