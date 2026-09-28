import { describe, expect, it } from 'vitest';
import { amountToMicro, parseBilling, percentToBasisPoints, printBilling } from './parse';
import { defaultBillingText } from './types';

describe('parseBilling', () => {
  it('parses the example from the brief', () => {
    const { spec, issues } = parseBilling(
      'Model calls: pass-through plus 0%. Storage: 1 credit per MB per month.',
    );
    expect(issues).toEqual([]);
    expect(spec.rules.modelCalls).toEqual({ mode: 'passThrough', marginBasisPoints: 0 });
    expect(spec.rules.storage).toEqual({ mode: 'fixed', priceMicro: 10_000, unit: 'MB', period: 'month' });
  });

  it('parses margins as integer basis points', () => {
    expect(percentToBasisPoints('0%')).toBe(0);
    expect(percentToBasisPoints('2.5%')).toBe(250);
    expect(percentToBasisPoints('12.34%')).toBe(1234);
    expect(percentToBasisPoints('1.234%')).toBeUndefined();
    const { spec } = parseBilling('Model calls: pass-through plus 7.5%.');
    expect(spec.rules.modelCalls).toEqual({ mode: 'passThrough', marginBasisPoints: 750 });
  });

  it('parses amounts as integer micro-dollars', () => {
    expect(amountToMicro('1 credit')).toBe(10_000);
    expect(amountToMicro('2 credits')).toBe(20_000);
    expect(amountToMicro('0.5 credits')).toBe(5_000);
    expect(amountToMicro('$0.01')).toBe(10_000);
    expect(amountToMicro('$1.000001')).toBe(1_000_001);
    expect(amountToMicro('three credits')).toBeUndefined();
  });

  it('parses settle and on-chain words', () => {
    const { spec, issues } = parseBilling('Settle: monthly.\nOn chain: on.');
    expect(issues).toEqual([]);
    expect(spec.settle).toBe('monthly');
    expect(spec.onChain).toBe('on');
  });

  it('reports unknown words instead of guessing', () => {
    const { issues } = parseBilling('Model calls: vibes.\nParking: free.\nStorage: 1 credit per furlong.');
    const messages = issues.map((issue) => issue.message);
    expect(messages).toContain('Unknown pricing "vibes"');
    expect(messages).toContain('Unknown subject "Parking"');
    expect(messages).toContain('Unknown unit "furlong"');
  });

  it('round-trips the default text', () => {
    const first = parseBilling(defaultBillingText);
    expect(first.issues).toEqual([]);
    const second = parseBilling(printBilling(first.spec));
    expect(second.issues).toEqual([]);
    expect(second.spec).toEqual(first.spec);
  });
});
