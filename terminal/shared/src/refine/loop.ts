/**
 * refine(): the best-of-3 beam loop (pass 5). Make N variants, score them,
 * keep the best, make N upgrades of it, repeat until a stop rule fires.
 * Generic over the variant type so skins, layouts and pages can share it.
 * Pure orchestration: generating and scoring are injected.
 */

export interface RefineParams {
  /** Variants per round. */
  variants: number;
  /** Stop when the best score reaches this (1–5 scale). */
  target_score: number;
  /** Stop after this many rounds without a better best. */
  patience: number;
  max_rounds: number;
  /** Total spend cap for the loop, micro-dollars. */
  cap_micro: number;
}

export const DEFAULT_REFINE: RefineParams = { variants: 3, target_score: 4.5, patience: 2, max_rounds: 5, cap_micro: 30_000 };

export type StopReason = 'target' | 'plateau' | 'max_rounds' | 'cap' | 'stopped' | 'error' | 'empty';

export interface Scored<V> {
  variant: V;
  score: number;
  note: string;
}

export interface RoundResult<V> {
  round: number;
  variants: Array<Scored<V>>;
  /** Index into variants of this round's best. */
  winner: number;
  /** Best score across all rounds after this one. */
  best: number;
  costMicro: number;
}

export interface RefineResult<V> {
  rounds: Array<RoundResult<V>>;
  best: Scored<V> | null;
  reason: StopReason;
  costMicro: number;
  error?: string;
}

export interface RefineHooks<V> {
  /** Make up to n variants. parent is the current best (null in round 1). Reports its own cost. */
  generate: (input: { round: number; n: number; parent: Scored<V> | null; signal: AbortSignal }) => Promise<{ variants: V[]; costMicro: number }>;
  /** Score variants on 1–5. Reports its own cost. */
  score: (input: { round: number; variants: V[]; signal: AbortSignal }) => Promise<{ scores: Array<{ score: number; note: string }>; costMicro: number }>;
  /** Estimated cost of one variant (generate + score), to stay under the cap. */
  estimateMicro: (round: number) => number;
  onRound?: (round: RoundResult<V>, spentMicro: number) => void;
  signal?: AbortSignal;
}

export async function refine<V>(params: RefineParams, hooks: RefineHooks<V>): Promise<RefineResult<V>> {
  const signal = hooks.signal ?? new AbortController().signal;
  const rounds: Array<RoundResult<V>> = [];
  let best: Scored<V> | null = null;
  let spent = 0;
  let stale = 0;
  const finish = (reason: StopReason, error?: string): RefineResult<V> => ({ rounds, best, reason, costMicro: spent, ...(error ? { error } : {}) });

  for (let round = 1; round <= params.max_rounds; round += 1) {
    if (signal.aborted) return finish('stopped');
    const each = Math.max(1, hooks.estimateMicro(round));
    const affordable = Math.floor((params.cap_micro - spent) / each);
    const n = Math.min(params.variants, affordable);
    if (n < 1) return finish('cap');
    let roundCost = 0;
    try {
      const made = await hooks.generate({ round, n, parent: best, signal });
      roundCost += made.costMicro;
      spent += made.costMicro;
      if (made.variants.length === 0) return finish(rounds.length === 0 ? 'empty' : 'plateau');
      if (signal.aborted) return finish('stopped');
      const judged = await hooks.score({ round, variants: made.variants, signal });
      roundCost += judged.costMicro;
      spent += judged.costMicro;
      const variants: Array<Scored<V>> = made.variants.map((variant, index) => ({
        variant,
        score: clampScore(judged.scores[index]?.score ?? 0),
        note: judged.scores[index]?.note ?? '',
      }));
      let winner = 0;
      variants.forEach((entry, index) => {
        if (entry.score > (variants[winner]?.score ?? -1)) winner = index;
      });
      const top = variants[winner];
      if (top && (best === null || top.score > best.score)) {
        best = top;
        stale = 0;
      } else {
        stale += 1;
      }
      const result: RoundResult<V> = { round, variants, winner, best: best?.score ?? 0, costMicro: roundCost };
      rounds.push(result);
      hooks.onRound?.(result, spent);
    } catch (error) {
      if (signal.aborted) return finish('stopped');
      return finish('error', error instanceof Error ? error.message : String(error));
    }
    if (best && best.score >= params.target_score) return finish('target');
    if (stale >= params.patience) return finish('plateau');
    if (spent >= params.cap_micro) return finish('cap');
  }
  return finish('max_rounds');
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, value));
}

export const STOP_LABELS: Record<StopReason, string> = {
  target: 'reached the target score',
  plateau: 'no better version for two rounds',
  max_rounds: 'hit the round limit',
  cap: 'hit the cost cap',
  stopped: 'stopped by you',
  error: 'stopped on an error',
  empty: 'found nothing to try',
};
