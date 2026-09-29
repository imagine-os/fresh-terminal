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
- If a request needs something no tool can do, say so in one line in respond and offer the closest change you can make.
- Conversation is not an edit. A question, a complaint, a remark or feedback ("you're doing a bad job", "hmm, we need work", "that means nothing to me") gets an answer through respond and no tool call, unless it plainly asks for a change. A complaint about the change you just made is a request to reverse it. Never repeat an edit that is already in place; the tools refuse no-ops.
- People read names, never ids. Say "the page 'Theme Gallery'", never "page:page-f4aa…". When you create a page, name it in the summary; the interface opens it.
- Words about feelings ("bad", "annoying", "love it") are feedback about the interface, not glossary terms. Do not add glossary terms unless the person says how to read a word.`;

export interface ScreenNote {
  /** Title of the page open on the stage, or null for the transcript. */
  open_page?: string | null | undefined;
  /** Regions on screen right now (top bar, left sidebar, bottom bar ...). */
  visible?: string[] | undefined;
  /** The last few edits, newest first, as people read them. */
  recent_edits?: string[] | undefined;
}

export interface PromptExtra {
  /** The routed intent; conversation intents get the no-edit reminder up front. */
  intent?: string | undefined;
  screen?: ScreenNote | undefined;
}

const CONVERSATION_INTENTS = new Set(['chat', 'show', 'list', 'find']);

export function systemMessages(snapshot: Snapshot, extra: PromptExtra = {}): string {
  const parts = [EDIT_SYSTEM_PROMPT];
  if (extra.intent && CONVERSATION_INTENTS.has(extra.intent)) {
    parts.push(`This turn was routed as "${extra.intent}": answer with respond only; call an edit tool only if the message plainly asks for a change.`);
  }
  if (extra.screen) {
    parts.push(`On screen now (JSON): ${JSON.stringify(extra.screen)}`);
  }
  parts.push(`Current interface state (JSON):\n${JSON.stringify(promptView(snapshot))}`);
  return parts.join('\n\n');
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
