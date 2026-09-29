import pricesJson from '../prices.json' with { type: 'json' };
import { applyMarginBasisPoints, dollarsToMicro } from '../../shared/src/ledger/types';

export interface ModelPrice {
  input_micro_per_million: number;
  output_micro_per_million: number;
}

export interface RealtimePrice {
  /** Micro-dollars per minute of audio in / out. Estimates until usage arrives. */
  audio_in_micro_per_minute: number;
  audio_out_micro_per_minute: number;
  estimate: boolean;
}

export interface PriceTable {
  default: ModelPrice;
  models: Record<string, ModelPrice>;
  realtime?: Record<string, RealtimePrice>;
}

export function realtimePrice(model: string, table: PriceTable = loadPrices()): RealtimePrice | null {
  return table.realtime?.[model] ?? null;
}

import type { Usage } from '../../shared/src/agent/openrouter';

export type { Usage };

export function loadPrices(): PriceTable {
  return pricesJson as unknown as PriceTable;
}

/** Cost in integer micro-dollars from OpenRouter usage, or the price table. */
export function costMicroFor(model: string, usage: Usage, table: PriceTable = loadPrices()): {
  costMicro: number;
  source: 'openrouter' | 'price-table';
} {
  if (typeof usage.cost === 'number' && Number.isFinite(usage.cost)) {
    return { costMicro: dollarsToMicro(usage.cost), source: 'openrouter' };
  }
  const price = table.models[model] ?? table.default;
  const input = Math.round((usage.prompt_tokens * price.input_micro_per_million) / 1_000_000);
  const output = Math.round((usage.completion_tokens * price.output_micro_per_million) / 1_000_000);
  return { costMicro: input + output, source: 'price-table' };
}

export function priceMicroFor(costMicro: number, marginBasisPoints: number): number {
  return applyMarginBasisPoints(costMicro, marginBasisPoints);
}
