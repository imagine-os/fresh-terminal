import { describe, expect, it } from 'vitest';
import { SEED_CARDS } from './index';
import { DEFAULT_THICKNESS_MM, cardSchema, makeCard } from './types';

describe('canvas cards', () => {
  it('seeds the starting cards with valid records', () => {
    expect(SEED_CARDS.map((card) => card.id)).toEqual([
      'audit-recommendation',
      'start-page-themes',
      'plan-pm-viewer',
      'docs-start-here',
      'first-box',
      'koi-pond',
    ]);
    for (const card of SEED_CARDS) {
      expect(cardSchema.safeParse(card).success).toBe(true);
    }
    expect(SEED_CARDS.find((card) => card.id === 'start-page-themes')).toMatchObject({
      title: 'Library of terminals',
      href: 'pages/library.html',
    });
  });

  it('gives paper 1 mm and images 10 mm by default', () => {
    const paper = makeCard({ title: 'A page', kind: 'page', href: 'pages/a.html' }, [], 1);
    const image = makeCard({ title: 'A photo', kind: 'image', href: 'img.png' }, [paper], 1);
    expect(paper.thickness_mm).toBe(DEFAULT_THICKNESS_MM.page);
    expect(image.thickness_mm).toBe(10);
    expect(image.x).not.toBe(paper.x);
  });

  it('keeps ids unique', () => {
    const first = makeCard({ title: 'Same', kind: 'doc', href: 'a' }, [], 1);
    const second = makeCard({ title: 'Same', kind: 'doc', href: 'b' }, [first], 1);
    expect(first.id).toBe('same');
    expect(second.id).toBe('same-2');
  });
});
