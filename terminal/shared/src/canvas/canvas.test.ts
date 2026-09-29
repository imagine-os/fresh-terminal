import { describe, expect, it } from 'vitest';
import { SEED_CARDS } from './index';
import { DEFAULT_THICKNESS_MM, cardSchema, makeCard } from './types';

describe('canvas cards', () => {
  it('seeds the starting cards with valid records', () => {
    expect(SEED_CARDS.map((card) => card.id)).toEqual([
      'landing',
      'audit-recommendation',
      'start-page-themes',
      'plan-pm-viewer',
      'docs-start-here',
      'first-box',
      'koi-pond',
      'canon',
      'freshstack',
      'brand-marks',
      'product-hunt-strategy',
      'koi-pond-v2',
      'koi-pond-v1',
      'canvas-v1',
    ]);
    for (const card of SEED_CARDS) {
      expect(cardSchema.safeParse(card).success).toBe(true);
    }
    expect(SEED_CARDS.find((card) => card.id === 'start-page-themes')).toMatchObject({
      title: 'Library of terminals',
      href: 'pages/library.html',
    });
    expect(SEED_CARDS.find((card) => card.id === 'koi-pond')?.href).toBe('pages/koi.html');
    expect(SEED_CARDS.find((card) => card.id === 'canon')).toMatchObject({ kind: 'doc', thickness_mm: 1 });
  });

  it('puts every seed card in a known section with a screenshot', () => {
    const sections = new Set(['terminal', 'worlds', 'docs', 'archive']);
    for (const card of SEED_CARDS) {
      expect(sections.has(card.section ?? '')).toBe(true);
      expect(card.thumb).toBe(`canvas/thumbs/${card.id}.jpg`);
    }
    expect(SEED_CARDS.filter((card) => card.archived).map((card) => card.id)).toEqual(['koi-pond-v2', 'koi-pond-v1', 'canvas-v1']);
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
