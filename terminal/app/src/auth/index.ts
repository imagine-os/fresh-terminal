import { AnonymousAuth } from './anonymous';
import type { AuthProvider } from './types';

export const auth: AuthProvider = new AnonymousAuth();
export type { AuthProvider, CurrentUser } from './types';
