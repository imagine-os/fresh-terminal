import { z } from 'zod';

export const CARD_KINDS = ['page', 'doc', 'image', 'box'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** Paper is 1 mm thick by default; images are 10 mm (a mounted print). */
export const DEFAULT_THICKNESS_MM: Record<CardKind, number> = {
  page: 1,
  doc: 1,
  image: 10,
  box: 1,
};

export const cardSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  kind: z.enum(CARD_KINDS),
  /** URL (relative to the app base or absolute) or an in-app ref like "route:/plan" or "box:<id>". */
  href: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  thickness_mm: z.number().positive(),
  rotation: z.number(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});
export type Card = z.infer<typeof cardSchema>;

export const cardsFileSchema = z.object({ cards: z.array(cardSchema) });

export interface CardInput {
  title: string;
  kind: CardKind;
  href: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  thickness_mm?: number;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Builds a full card from a short input, placing it on a grid after existing cards. */
export function makeCard(input: CardInput, existing: Card[], now: number = Date.now()): Card {
  const index = existing.length;
  const column = index % 3;
  const row = Math.floor(index / 3);
  const baseId = slugify(input.title) || 'card';
  let id = baseId;
  let suffix = 2;
  while (existing.some((card) => card.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return cardSchema.parse({
    id,
    title: input.title,
    kind: input.kind,
    href: input.href,
    x: input.x ?? 40 + column * 380,
    y: input.y ?? 40 + row * 300,
    w: input.w ?? 340,
    h: input.h ?? (input.kind === 'image' ? 240 : 220),
    thickness_mm: input.thickness_mm ?? DEFAULT_THICKNESS_MM[input.kind],
    rotation: 0,
    created_at: now,
    updated_at: now,
  });
}
