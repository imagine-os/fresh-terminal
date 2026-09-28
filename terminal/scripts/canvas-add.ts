/**
 * pnpm -C terminal canvas:add --title "Name" --href pages/x.html --kind page [--thickness 10]
 * Appends a card to docs/canvas/cards.json (the master canvas seed).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CARD_KINDS, cardsFileSchema, makeCard, type CardKind } from '../shared/src/canvas/types.ts';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const title = arg('title');
const href = arg('href');
const kind = arg('kind') as CardKind | undefined;
const thickness = arg('thickness');

if (!title || !href || !kind || !(CARD_KINDS as readonly string[]).includes(kind)) {
  console.error('usage: canvas:add --title "Name" --href <url|route:/x|box:<id>> --kind page|doc|image|box [--thickness mm]');
  process.exit(1);
}

const path = resolve('docs/canvas/cards.json');
const file = JSON.parse(readFileSync(path, 'utf8')) as { $comment?: string; cards: unknown[] };
const existing = cardsFileSchema.parse(file).cards;
const card = makeCard(
  { title, href, kind, ...(thickness ? { thickness_mm: Number(thickness) } : {}) },
  existing,
);
file.cards.push(card);
writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
console.log(`added card ${card.id} at (${card.x}, ${card.y}), ${card.thickness_mm} mm`);
