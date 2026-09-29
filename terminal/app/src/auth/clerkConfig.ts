/**
 * Clerk configuration (2026-09-29). The publishable key is public by design
 * (it names the Clerk Frontend API host) and is injected at build time from
 * the GitHub secret CLERK_PUBLISHABLE_KEY as VITE_CLERK_PUBLISHABLE_KEY.
 * Without it the app runs signed out only and the Sign in button says
 * "not wired yet".
 */
export const CLERK_PUBLISHABLE_KEY: string = ((import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? '').trim();

export function clerkEnabled(key: string = CLERK_PUBLISHABLE_KEY): boolean {
  return /^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(key);
}

/** "development" for pk_test_ keys (Clerk shows a dev badge, 100-user cap), "production" for pk_live_. */
export function clerkInstanceKind(key: string = CLERK_PUBLISHABLE_KEY): 'development' | 'production' | 'none' {
  if (!clerkEnabled(key)) return 'none';
  return key.startsWith('pk_live_') ? 'production' : 'development';
}
