import { NotWiredError } from '../lib/notWired';
import type { AuthProvider, CurrentUser } from './types';

/**
 * Superseded 2026-09-29: Clerk is wired through React in auth/Account.tsx
 * (@clerk/react, anonymous-first). The store identity stays AnonymousAuth so
 * signed-out boxes keep working; signed-in boxes sync to D1 by Clerk user id.
 * This class remains for the SpacetimeDB OIDC seam (not wired yet).
 */
export class ClerkAuth implements AuthProvider {
  readonly name = 'clerk';

  async getIdentityToken(): Promise<string | null> {
    throw new NotWiredError('Clerk identity token');
  }

  currentUser(): CurrentUser {
    throw new NotWiredError('Clerk current user');
  }

  async signIn(): Promise<void> {
    throw new NotWiredError('Clerk sign in');
  }

  async signOut(): Promise<void> {
    throw new NotWiredError('Clerk sign out');
  }
}
