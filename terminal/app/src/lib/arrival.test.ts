import { describe, expect, it } from 'vitest';
import { arrivalIntent } from './arrival';

describe('arrival intent from the sales pages', () => {
  it('reads ?signin=1 and ?open=key and keeps other parameters', () => {
    expect(arrivalIntent('?signin=1')).toEqual({ intent: 'signin', rest: '' });
    expect(arrivalIntent('?open=key&prompt=hi')).toEqual({ intent: 'key', rest: '?prompt=hi' });
    expect(arrivalIntent('?lang=es&signin=1')).toEqual({ intent: 'signin', rest: '?lang=es' });
  });

  it('ignores anything else', () => {
    expect(arrivalIntent('')).toEqual({ intent: null, rest: '' });
    expect(arrivalIntent('?signin=0')).toEqual({ intent: null, rest: '' });
    expect(arrivalIntent('?open=canvas')).toEqual({ intent: null, rest: '?open=canvas' });
  });
});
