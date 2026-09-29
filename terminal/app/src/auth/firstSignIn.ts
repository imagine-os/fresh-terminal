/**
 * The $5 starter kit is a first-sign-up offer (Justin, 2026-09-29: "if they want
 * $5 free they have to sign in for the 1st time. its only for first time
 * signups"). A device that has never signed in sees "Get $5 free"; once anyone
 * signs in here we set this flag and the button is plain "Sign in". The router
 * enforces once per person; this flag only picks the words. The sales pages
 * (same origin) read the same key.
 */
export const SIGNED_IN_FLAG = 'ft.hasSignedIn';

export function hasSignedInBefore(storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(SIGNED_IN_FLAG) === '1';
  } catch {
    return false;
  }
}

export function markSignedIn(storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(SIGNED_IN_FLAG, '1');
  } catch {
    // storage blocked: the offer label stays; harmless
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The sign-in button's label and tooltip keys for this device. */
export function signInLabelKeys(signedInBefore: boolean): { label: 'account.signIn' | 'account.getFree'; tip: 'account.signIn.tip' | 'account.getFree.tip' } {
  return signedInBefore ? { label: 'account.signIn', tip: 'account.signIn.tip' } : { label: 'account.getFree', tip: 'account.getFree.tip' };
}
