import type { Card } from './types';

/** Canvas v2 sections, in reading order. Anything else lands in "added". */
export const SECTION_ORDER = ['terminal', 'worlds', 'docs', 'archive', 'added'] as const;
export type SectionId = (typeof SECTION_ORDER)[number];

/** Paper card: a 16:10 print with a margin and a title strip below it (world px). */
export const CARD_W = 320;
export const CARD_H = 256;
export const CARD_MARGIN = 10;
export const THUMB_W = CARD_W - CARD_MARGIN * 2;
export const THUMB_H = Math.round((THUMB_W * 10) / 16);
const GAP = 32;
const FRAME_PAD = 36;
const FRAME_HEAD = 72;
const FRAME_GAP = 88;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Frame extends Rect {
  id: SectionId;
  count: number;
}
export interface Layout {
  frames: Frame[];
  slots: Record<string, Rect & { section: SectionId }>;
  bounds: Rect;
}

export function sectionOf(card: Pick<Card, 'section'>): SectionId {
  const id = card.section as SectionId | undefined;
  return id && (SECTION_ORDER as readonly string[]).includes(id) ? id : 'added';
}

/**
 * Lays sections out as frames on a grid of `frameColumns`, each frame holding
 * its cards in `cardColumns` columns. Pure: the same cards give the same layout.
 */
export function layoutCanvas(cards: Pick<Card, 'id' | 'section'>[], frameColumns = 2, cardColumns = 2): Layout {
  const groups = new Map<SectionId, string[]>();
  for (const card of cards) {
    const section = sectionOf(card);
    groups.set(section, [...(groups.get(section) ?? []), card.id]);
  }
  const sections = SECTION_ORDER.filter((id) => (groups.get(id)?.length ?? 0) > 0);
  const cols = Math.max(1, Math.min(cardColumns, 4));
  const sized = sections.map((id) => {
    const ids = groups.get(id) ?? [];
    const c = Math.min(cols, ids.length);
    const rows = Math.ceil(ids.length / cols);
    return { id, ids, w: FRAME_PAD * 2 + c * CARD_W + (c - 1) * GAP, h: FRAME_HEAD + FRAME_PAD + rows * CARD_H + (rows - 1) * GAP };
  });
  const fc = Math.max(1, Math.min(frameColumns, sized.length || 1));
  const colW = Array.from({ length: fc }, (_, i) => Math.max(0, ...sized.filter((_, k) => k % fc === i).map((s) => s.w)));
  const frames: Frame[] = [];
  const slots: Layout['slots'] = {};
  let y = 0;
  for (let row = 0; row * fc < sized.length; row += 1) {
    const inRow = sized.slice(row * fc, row * fc + fc);
    let x = 0;
    inRow.forEach((s, i) => {
      frames.push({ id: s.id, x, y, w: s.w, h: s.h, count: s.ids.length });
      s.ids.forEach((id, k) => {
        slots[id] = {
          section: s.id,
          x: x + FRAME_PAD + (k % cols) * (CARD_W + GAP),
          y: y + FRAME_HEAD + Math.floor(k / cols) * (CARD_H + GAP),
          w: CARD_W,
          h: CARD_H,
        };
      });
      x += (colW[i] ?? s.w) + FRAME_GAP;
    });
    y += Math.max(...inRow.map((s) => s.h)) + FRAME_GAP;
  }
  const maxX = Math.max(0, ...frames.map((f) => f.x + f.w));
  const maxY = Math.max(0, ...frames.map((f) => f.y + f.h));
  return { frames, slots, bounds: { x: 0, y: 0, w: maxX, h: maxY } };
}

/** How many frame columns suit a surface of this aspect ratio. */
export function frameColumnsFor(width: number, height: number, sections: number): number {
  const aspect = width / Math.max(1, height);
  const want = aspect > 1.7 ? 4 : aspect > 0.95 ? 2 : 1;
  return Math.max(1, Math.min(want, sections));
}

/** View that fits a rect into a surface with padding (screen px). */
export function fitView(rect: Rect, width: number, height: number, padding = 48, min = 0.08, max = 2.5): { x: number; y: number; zoom: number } {
  const zoom = Math.max(min, Math.min(max, Math.min((width - padding * 2) / Math.max(1, rect.w), (height - padding * 2) / Math.max(1, rect.h))));
  return { zoom, x: (width - rect.w * zoom) / 2 - rect.x * zoom, y: (height - rect.h * zoom) / 2 - rect.y * zoom };
}

/** Tries frame and card column counts and keeps the layout that fits the surface at the largest zoom. */
export function bestLayout(cards: Pick<Card, 'id' | 'section'>[], width: number, height: number, padding = 48): Layout & { frameColumns: number; cardColumns: number } {
  let best: (Layout & { frameColumns: number; cardColumns: number; zoom: number }) | null = null;
  for (let fc = 1; fc <= 4; fc += 1) {
    for (let cc = 1; cc <= 4; cc += 1) {
      const layout = layoutCanvas(cards, fc, cc);
      const { zoom } = fitView(layout.bounds, width, height, padding, 0, 99);
      if (best === null || zoom > best.zoom * 1.02) {
        best = { ...layout, frameColumns: fc, cardColumns: cc, zoom };
      }
    }
  }
  return best!;
}
