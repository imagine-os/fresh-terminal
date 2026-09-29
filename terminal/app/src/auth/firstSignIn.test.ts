import { describe, expect, it } from 'vitest';
import { SIGNED_IN_FLAG, hasSignedInBefore, markSignedIn, signInLabelKeys } from './firstSignIn';

function memory() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
}

describe('first sign-up offer', () => {
  it('offers $5 until this device has signed in once, then says plain Sign in', () => {
    const storage = memory();
    expect(hasSignedInBefore(storage)).toBe(false);
    expect(signInLabelKeys(hasSignedInBefore(storage)).label).toBe('account.getFree');
    markSignedIn(storage);
    expect(storage.getItem(SIGNED_IN_FLAG)).toBe('1');
    expect(hasSignedInBefore(storage)).toBe(true);
    expect(signInLabelKeys(true)).toEqual({ label: 'account.signIn', tip: 'account.signIn.tip' });
  });

  it('shows the offer when storage is missing or throws', () => {
    expect(hasSignedInBefore(null)).toBe(false);
    expect(hasSignedInBefore({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(() => markSignedIn({ setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
});
