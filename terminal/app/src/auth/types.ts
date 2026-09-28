export interface CurrentUser {
  id: string;
  displayName: string;
  anonymous: boolean;
}

/**
 * The auth seam. AnonymousAuth is used now. ClerkAuth is the intended
 * replacement (Clerk issues OIDC tokens, which SpacetimeDB accepts as identity
 * tokens), not wired in pass one.
 */
export interface AuthProvider {
  readonly name: string;
  getIdentityToken(): Promise<string | null>;
  currentUser(): CurrentUser;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}
