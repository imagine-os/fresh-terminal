import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react';
import { useCallback, useEffect, useState } from 'react';
import { CLERK_PUBLISHABLE_KEY, clerkEnabled } from '../auth/clerkConfig';
import { HubError, hubSession, type TokenFn } from './api';
import { Hub } from './Hub';
import { liveClient, sampleClient, isLocalPreview } from './client';

/**
 * The hub's gate (2026-09-29, C-086). Signed out: a sign-in prompt and nothing
 * else. Signed in: the site Worker checks the session with the router
 * (/hub/api/session); only admins get the content. The same check guards every
 * data file, so this page cannot show anything the server did not allow.
 */
const HUB_HOSTS = ['freshterminal.ai', 'localhost', '127.0.0.1'];

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="hub-gate" data-testid="hub">
      <section className="hub-card" aria-labelledby="hub-title">
        <p className="hub-kicker">Fresh Terminal</p>
        <h1 id="hub-title">Hub</h1>
        {children}
      </section>
    </main>
  );
}

export function HubRoot() {
  if (typeof window !== 'undefined' && !HUB_HOSTS.includes(window.location.hostname)) {
    return (
      <Frame>
        <p>The hub runs on the domain, where the server can check who is signed in.</p>
        <p>
          <a className="hub-button" href="https://freshterminal.ai/hub">
            Open freshterminal.ai/hub
          </a>
        </p>
      </Frame>
    );
  }
  if (isLocalPreview()) return <Hub client={sampleClient()} who={{ name: 'Sample admin (local preview)', userId: 'user_sample' }} onSignOut={() => undefined} sample />;
  if (!clerkEnabled()) {
    return (
      <Frame>
        <p>Sign-in is not wired yet in this build (no Clerk key).</p>
      </Frame>
    );
  }
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/hub">
      <Gate />
    </ClerkProvider>
  );
}

type GateState = { state: 'checking' } | { state: 'admin'; userId: string } | { state: 'denied'; reason: string } | { state: 'error'; message: string };

function Gate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const [gate, setGate] = useState<GateState>({ state: 'checking' });
  const token: TokenFn = useCallback(() => getToken(), [getToken]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let live = true;
    setGate({ state: 'checking' });
    hubSession(token)
      .then((session) => live && setGate({ state: 'admin', userId: session.userId }))
      .catch((error: unknown) => {
        if (!live) return;
        if (error instanceof HubError && (error.status === 401 || error.status === 403)) setGate({ state: 'denied', reason: error.message });
        else setGate({ state: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      live = false;
    };
  }, [isLoaded, isSignedIn, token]);

  if (!isLoaded) {
    return (
      <Frame>
        <p aria-live="polite">Checking sign-in…</p>
      </Frame>
    );
  }
  if (!isSignedIn) {
    return (
      <Frame>
        <p>Admins only. Sign in to see the work, the docs, the prompt library and the credits panel.</p>
        <p className="hub-actions">
          <button type="button" className="hub-button" data-testid="hub-sign-in" onClick={() => clerk.openSignIn({ forceRedirectUrl: '/hub' })}>
            Sign in
          </button>
          <a className="hub-button hub-quiet" href="/">
            Back to the terminal
          </a>
        </p>
      </Frame>
    );
  }
  const name = user?.primaryEmailAddress?.emailAddress ?? user?.username ?? user?.firstName ?? 'this account';
  if (gate.state === 'admin') {
    return <Hub client={liveClient(token)} who={{ name, userId: gate.userId }} onSignOut={() => void clerk.signOut({ redirectUrl: '/hub' })} />;
  }
  return (
    <Frame>
      {gate.state === 'checking' ? <p aria-live="polite">Checking admin access…</p> : null}
      {gate.state === 'denied' ? (
        <>
          <p>
            Signed in as <strong>{name}</strong>, which is not a hub admin.
          </p>
          <p className="hub-muted">{gate.reason}</p>
        </>
      ) : null}
      {gate.state === 'error' ? <p role="alert">The hub could not check access: {gate.message}</p> : null}
      <p className="hub-actions">
        <button type="button" className="hub-button" onClick={() => void clerk.signOut({ redirectUrl: '/hub' })}>
          Sign out
        </button>
        <a className="hub-button hub-quiet" href="/">
          Back to the terminal
        </a>
      </p>
    </Frame>
  );
}
