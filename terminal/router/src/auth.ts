import { verifyToken } from '@clerk/backend';

/**
 * Clerk session verification for the router (2026-09-29).
 *
 * The browser sends `Authorization: Bearer <Clerk session JWT>`. We verify it
 * without a network call when CLERK_JWT_KEY (the instance's PEM public key,
 * pushed by router-deploy from the Clerk JWKS) is set; otherwise
 * @clerk/backend fetches the JWKS once with CLERK_SECRET_KEY and caches it.
 * Anonymous callers are fine everywhere except /me and /sync/*.
 */
export interface AuthBindings {
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
}

export type AuthResult =
  | { state: 'anonymous' }
  | { state: 'signed-in'; userId: string; sessionId: string | null }
  | { state: 'invalid'; reason: string }
  | { state: 'not-configured' };

export type TokenVerifier = (token: string, options: { jwtKey?: string; secretKey?: string; authorizedParties: string[] }) => Promise<{ sub: string; sid?: string }>;

export const clerkVerifier: TokenVerifier = async (token, options) => {
  const payload = await verifyToken(token, {
    ...(options.jwtKey ? { jwtKey: options.jwtKey } : {}),
    ...(options.secretKey ? { secretKey: options.secretKey } : {}),
    authorizedParties: options.authorizedParties,
  });
  return { sub: String(payload.sub), ...(typeof payload.sid === 'string' ? { sid: payload.sid } : {}) };
};

export function bearerToken(header: string | undefined | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export function clerkConfigured(bindings: AuthBindings): boolean {
  return Boolean(bindings.CLERK_JWT_KEY || bindings.CLERK_SECRET_KEY);
}

export async function authenticate(
  header: string | undefined | null,
  bindings: AuthBindings,
  authorizedParties: string[],
  verifier: TokenVerifier = clerkVerifier,
): Promise<AuthResult> {
  const token = bearerToken(header);
  if (!token) return { state: 'anonymous' };
  if (!clerkConfigured(bindings)) return { state: 'not-configured' };
  try {
    const claims = await verifier(token, {
      ...(bindings.CLERK_JWT_KEY ? { jwtKey: bindings.CLERK_JWT_KEY.replace(/\\n/g, '\n') } : {}),
      ...(bindings.CLERK_SECRET_KEY ? { secretKey: bindings.CLERK_SECRET_KEY } : {}),
      authorizedParties,
    });
    if (!claims.sub) return { state: 'invalid', reason: 'token has no subject' };
    return { state: 'signed-in', userId: claims.sub, sessionId: claims.sid ?? null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { state: 'invalid', reason: reason.slice(0, 200) };
  }
}
