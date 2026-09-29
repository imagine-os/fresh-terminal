import { z } from 'zod';
import { cardSchema } from '../canvas/types';
import { chipSchema, type Chip } from '../chips/types';
import { defaultSpecText } from '../dialect/types';
import type { EngineContext, UiState } from '../ops/engine';
import { starterSchema } from '../starters/types';
import { SITE_PAGES, boxUiSchema, glossaryTermSchema, navItemSchema, pageSchema } from '../ui/types';

/**
 * What the client sends with every request: the box's own records, compact
 * but complete enough for the router to dry-run the model's ops.
 */
export const snapshotSchema = z.object({
  box: z.object({ id: z.string(), name: z.string() }),
  nav: z.array(navItemSchema).max(200),
  pages: z.array(pageSchema).max(50),
  boxUi: boxUiSchema,
  themes: z.array(z.object({ id: z.string(), name: z.string() })).max(40),
  actions: z.array(z.object({ id: z.string(), intent: z.string() })).max(120),
  boxes: z.array(z.object({ id: z.string(), name: z.string() })).max(60),
  starters: z.array(starterSchema).max(80),
  cards: z.array(cardSchema).max(120),
  glossary: z.array(glossaryTermSchema).max(300),
  /** Theme id actually in effect (box override or visitor default). */
  effectiveThemeId: z.string(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const requestChipsSchema = z.array(chipSchema).max(60);

/** Validates chips from a request and drops undefined keys (strict optional types). */
export function parseChips(raw: unknown): Chip[] {
  const parsed = requestChipsSchema.safeParse(raw);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.map((chip) => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(chip)) {
      if (value !== undefined) {
        clean[key] = value;
      }
    }
    return clean as unknown as Chip;
  });
}

export function toUiState(snapshot: Snapshot): UiState {
  return {
    nav: snapshot.nav,
    pages: snapshot.pages,
    boxUi: snapshot.boxUi,
    cards: snapshot.cards,
    starters: snapshot.starters,
    glossary: snapshot.glossary,
  };
}

export function engineContext(snapshot: Snapshot, now: number, newId: (prefix: string) => string): EngineContext {
  return {
    boxId: snapshot.box.id,
    now,
    newId,
    themeIds: snapshot.themes.map((theme) => theme.id),
    actionIds: snapshot.actions.map((action) => action.id),
    boxes: snapshot.boxes,
  };
}

/** A smaller view for the model's context window. */
export function promptView(snapshot: Snapshot): Record<string, unknown> {
  return {
    box: snapshot.box.name,
    sidebar_menu: snapshot.nav.map((item) => ({
      id: item.id,
      label: item.label,
      parent: item.parent_id,
      target: item.target,
    })),
    pages: snapshot.pages.map((page) => ({ id: page.id, title: page.title, blocks: page.blocks.slice(0, 12) })),
    layout_dialect: snapshot.boxUi.dialect_text ?? defaultSpecText,
    theme: snapshot.effectiveThemeId,
    themes: snapshot.themes,
    style_overrides: snapshot.boxUi.style,
    site_pages: SITE_PAGES,
    actions: snapshot.actions.map((action) => action.id),
    boxes: snapshot.boxes,
    glossary: snapshot.glossary.map((term) => ({ text: term.text, type: term.type, note: term.note })),
    canvas_cards: snapshot.cards.map((card) => ({ id: card.id, title: card.title })),
    user_starters: snapshot.starters.filter((starter) => starter.tags.includes('user')).map((starter) => starter.text),
  };
}
