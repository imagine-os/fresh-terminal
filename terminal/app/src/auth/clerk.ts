import { NotWiredError } from '../lib/notWired';
import type { AuthProvider, CurrentUser } from './types';

/**
 * Clerk is the chosen provider. This stub exists so the seam is real and the
 * swap is one line in auth/index.ts. Wiring it needs @clerk/clerk-react, a
 * publishable key, and a SpacetimeDB OIDC issuer config. Pass 2.
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
