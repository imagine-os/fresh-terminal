import { formatMicro } from '@shared/ledger';

/**
 * The $ used counter reads in USD by default and can be switched to COP or
 * BTC (Justin, C-090). Rates are fixed reference values for reading, not for
 * billing; billing stays in USD micro-dollars on the ledger.
 */
export const CURRENCIES = ['usd', 'cop', 'btc'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Units per 1 USD, reference values noted on 2026-09-29. */
export const RATES: Record<Currency, { perUsd: number; label: string; asOf: string }> = {
  usd: { perUsd: 1, label: 'USD', asOf: '' },
  cop: { perUsd: 4000, label: 'COP', asOf: '2026-09-29' },
  btc: { perUsd: 1 / 110_000, label: 'BTC', asOf: '2026-09-29' },
};

export function nextCurrency(current: Currency): Currency {
  const index = CURRENCIES.indexOf(current);
  return CURRENCIES[(index + 1) % CURRENCIES.length] as Currency;
}

/** Micro-dollars in the chosen currency, sized for a top bar. */
export function formatMoney(micro: number, currency: Currency, fractionDigits = 4): string {
  if (currency === 'usd') return formatMicro(micro, fractionDigits);
  const usd = micro / 1_000_000;
  const amount = usd * RATES[currency].perUsd;
  if (currency === 'cop') {
    return `${Math.round(amount).toLocaleString('es-CO')} COP`;
  }
  // Bitcoin reads in satoshis below 0.001 BTC.
  const sats = Math.round(amount * 100_000_000);
  return sats < 100_000 ? `${sats.toLocaleString('en-US')} sat` : `${amount.toFixed(6)} BTC`;
}
