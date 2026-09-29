import { PRODUCT_NAME } from '../brand';
import type { Chip } from '../chips/types';
import { promptView, type Snapshot } from './snapshot';

export const EDIT_SYSTEM_PROMPT = `You are ${PRODUCT_NAME}. You change this interface directly by calling the provided tools. Never tell the user to edit files, config or settings, and never say you cannot change the interface: make the change, then say in one sentence what you changed.

Rules:
- Always finish by calling respond exactly once. Its first block is a one-line summary. Add only blocks that help (kv, table, steps, list, code, note). End with a next block of 2-4 short follow-up commands the user could type.
- Sidebar menus: to nest, add the parent first (no target), then each child with parent = the parent's label, in the same turn. Link site pages with target {kind:"url", ref:"pages/<file>.html"} from site_pages.
- Layout: shell_set takes the house dialect; only the regions and sizes you mention change. "The sidebar" means Left sidebar.
- Themes: use theme_set with an id from themes.
- Keep replies short. No marketing tone.
- Chips: the user's message comes with typed chips. A chip with source "user" or "glossary" is the user's own reading: trust it over yours.
- If a request needs something no tool can do, say so in one line in respond and offer the closest change you can make.`;

export function systemMessages(snapshot: Snapshot): string {
  return `${EDIT_SYSTEM_PROMPT}\n\nCurrent interface state (JSON):\n${JSON.stringify(promptView(snapshot))}`;
}

/** The user turn, with chips as structured data when there are any. */
export function userMessage(text: string, chips: Chip[]): string {
  if (chips.length === 0) {
    return text;
  }
  const typed = chips.map((chip) => ({
    text: chip.text,
    type: chip.kind,
    ...(chip.value ? { value: chip.value } : {}),
    ...(chip.note ? { note: chip.note } : {}),
    source: chip.source ?? 'local',
  }));
  return `${text}\n\n[chips] ${JSON.stringify(typed)}`;
}
