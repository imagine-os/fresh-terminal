import { newId } from '../lib/ids';
import { readJson, writeJson } from '../lib/storage';
import type { AuthProvider, CurrentUser } from './types';

const KEY = 'fresh-terminal.identity';

export class AnonymousAuth implements AuthProvider {
  readonly name = 'anonymous';
  private readonly id: string;

  constructor() {
    const saved = readJson<string | null>(KEY, null);
    this.id = saved ?? newId('anon');
    if (saved === null) {
      writeJson(KEY, this.id);
    }
  }

  async getIdentityToken(): Promise<string | null> {
    return null;
  }

  currentUser(): CurrentUser {
    return { id: this.id, displayName: 'you', anonymous: true };
  }

  async signIn(): Promise<void> {
    // nothing to do: anonymous identity is stable per browser
  }

  async signOut(): Promise<void> {
    // keep the identity so the visitor's boxes stay reachable
  }
}
