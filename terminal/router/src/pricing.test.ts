import { describe, expect, it } from 'vitest';
import { costMicroFor, priceMicroFor } from './pricing';

describe('pricing', () => {
  it('prefers OpenRouter cost when present and converts to integer micro-dollars', () => {
    const result = costMicroFor('openrouter/auto', {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      cost: 0.00123,
    });
    expect(result).toEqual({ costMicro: 1230, source: 'openrouter' });
  });

  it('falls back to the price table with integer rounding', () => {
    const result = costMicroFor(
      'unknown/model',
      { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
      {
        default: { input_micro_per_million: 1_000_000, output_micro_per_million: 3_000_000 },
        models: {},
      },
    );
    expect(result).toEqual({ costMicro: 1000 + 1500, source: 'price-table' });
  });

  it('applies margins from basis points', () => {
    expect(priceMicroFor(1000, 0)).toBe(1000);
    expect(priceMicroFor(1000, 500)).toBe(1050);
  });
});
