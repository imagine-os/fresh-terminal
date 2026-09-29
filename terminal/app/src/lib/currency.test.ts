import { describe, expect, it } from 'vitest';
import { formatMoney, nextCurrency } from './currency';

describe('currency (C-090)', () => {
  it('reads micro-dollars in USD, COP and sats', () => {
    expect(formatMoney(86_400, 'usd')).toBe('$0.0864');
    expect(formatMoney(86_400, 'cop')).toBe('346 COP');
    expect(formatMoney(86_400, 'btc')).toBe('79 sat');
    expect(formatMoney(5_000_000, 'btc')).toBe('4,545 sat');
  });
  it('cycles usd → cop → btc → usd', () => {
    expect(nextCurrency('usd')).toBe('cop');
    expect(nextCurrency('btc')).toBe('usd');
  });
});
