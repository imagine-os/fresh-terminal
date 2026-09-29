import { describe, expect, it } from 'vitest';
import { SEED_CARDS } from './index';
import { CARD_W, bestLayout, fitView, frameColumnsFor, layoutCanvas, sectionOf } from './layout';

describe('canvas v2 layout', () => {
  it('puts every seed card in a slot inside its section frame, without overlaps', () => {
    for (const columns of [1, 2, 4]) {
      const layout = layoutCanvas(SEED_CARDS, columns);
      const rects = SEED_CARDS.map((card) => layout.slots[card.id]!);
      expect(rects.every(Boolean)).toBe(true);
      for (const card of SEED_CARDS) {
        const slot = layout.slots[card.id]!;
        const frame = layout.frames.find((f) => f.id === slot.section)!;
        expect(slot.x).toBeGreaterThanOrEqual(frame.x);
        expect(slot.x + slot.w).toBeLessThanOrEqual(frame.x + frame.w);
        expect(slot.y + slot.h).toBeLessThanOrEqual(frame.y + frame.h);
      }
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i]!, b = rects[j]!;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBe(false);
        }
      }
    }
  });

  it('keeps sections in order and sends unknown sections to "added"', () => {
    const layout = layoutCanvas([{ id: 'a', section: 'docs' }, { id: 'b', section: 'nope' }, { id: 'c', section: 'terminal' }], 4);
    expect(layout.frames.map((f) => f.id)).toEqual(['terminal', 'docs', 'added']);
    expect(sectionOf({ section: undefined })).toBe('added');
  });

  it('chooses frame columns by aspect and fits the bounds', () => {
    expect(frameColumnsFor(3840, 2000, 4)).toBe(4);
    expect(frameColumnsFor(1280, 700, 4)).toBe(4);
    expect(frameColumnsFor(1024, 900, 4)).toBe(2);
    expect(frameColumnsFor(390, 700, 4)).toBe(1);
    const view = fitView({ x: 0, y: 0, w: CARD_W * 4, h: 600 }, 1280, 800);
    expect(view.zoom).toBeGreaterThan(0.5);
    expect(view.x).toBeGreaterThanOrEqual(0);
  });

  it('picks the arrangement that fits best for phone and desktop', () => {
    const phone = bestLayout(SEED_CARDS, 390, 640);
    const desk = bestLayout(SEED_CARDS, 1180, 680);
    expect(phone.bounds.h).toBeGreaterThan(phone.bounds.w);
    expect(desk.bounds.w).toBeGreaterThan(desk.bounds.h);
    expect(fitView(desk.bounds, 1180, 680).zoom).toBeGreaterThan(0.38);
  });
});
