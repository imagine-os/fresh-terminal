import { describe, expect, it } from 'vitest';
import { DEFAULT_REFINE, refine } from './loop';

type V = { id: string; quality: number };

function hooks(scores: number[][], options: { cost?: number; estimate?: number } = {}) {
  let round = 0;
  const parents: Array<string | null> = [];
  return {
    parents,
    hooks: {
      generate: async ({ n, parent }: { n: number; parent: { variant: V } | null }) => {
        parents.push(parent ? parent.variant.id : null);
        const row = scores[round] ?? [];
        round += 1;
        return { variants: row.slice(0, n).map((quality, index) => ({ id: `r${round}v${index}`, quality })), costMicro: options.cost ?? 1000 };
      },
      score: async ({ variants }: { variants: V[] }) => ({ scores: variants.map((v) => ({ score: v.quality, note: '' })), costMicro: 100 }),
      estimateMicro: () => options.estimate ?? 1500,
    },
  };
}

describe('refine (best-of-3 beam)', () => {
  it('keeps the best, feeds it forward as the parent, and stops at the target score', async () => {
    const h = hooks([[2, 3.1, 2.5], [3.4, 4.6, 4.0], [5, 5, 5]]);
    const result = await refine<V>(DEFAULT_REFINE, h.hooks);
    expect(result.reason).toBe('target');
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0]?.winner).toBe(1);
    expect(h.parents).toEqual([null, 'r1v1']);
    expect(result.best?.variant.id).toBe('r2v1');
    expect(result.costMicro).toBe(2200);
  });

  it('stops after two rounds without a better best', async () => {
    const result = await refine<V>(DEFAULT_REFINE, hooks([[3, 3.5, 2], [3.2, 3.4, 3.0], [3.5, 1, 1], [4.9]]).hooks);
    expect(result.reason).toBe('plateau');
    expect(result.rounds).toHaveLength(3);
    expect(result.best?.score).toBe(3.5);
  });

  it('stops at five rounds', async () => {
    const result = await refine<V>(DEFAULT_REFINE, hooks([[1], [1.5], [2], [2.5], [3], [3.5]]).hooks);
    expect(result.reason).toBe('max_rounds');
    expect(result.rounds).toHaveLength(5);
  });

  it('never plans past the cost cap: fewer variants, then stop', async () => {
    // 3¢ cap, each variant estimated at 1.2¢: round 1 affords 2, then 0 left after spending.
    const h = hooks([[2, 3, 4], [4, 4]], { estimate: 12_000, cost: 20_000 });
    const result = await refine<V>(DEFAULT_REFINE, h.hooks);
    expect(result.rounds[0]?.variants).toHaveLength(2);
    expect(result.reason).toBe('cap');
    expect(result.costMicro).toBeLessThanOrEqual(DEFAULT_REFINE.cap_micro);
  });

  it('stops when the user presses Stop and keeps the best so far', async () => {
    const controller = new AbortController();
    const h = hooks([[2, 3, 2.5], [3, 3, 3]]);
    const result = await refine<V>(DEFAULT_REFINE, {
      ...h.hooks,
      signal: controller.signal,
      onRound: () => controller.abort(),
    });
    expect(result.reason).toBe('stopped');
    expect(result.best?.score).toBe(3);
    expect(result.rounds).toHaveLength(1);
  });
});
