import { makeCard, type Card } from '../canvas/types';
import { mergeDialect } from '../dialect/parse';
import { defaultSpecText } from '../dialect/types';
import type { Starter } from '../starters/types';
import { pathLabel, subtree } from '../ui/nav';
import { SKIN_PATH_LABELS, SKIN_TARGET_LABELS, skinSchema, type Skin } from '../ui/skin';
import type { BoxUi, GlossaryTerm, NavItem, NavTarget, Page } from '../ui/types';
import type { Op } from './schema';

/** Everything one box's interface is made of, plus the global canvas and starters. */
export interface UiState {
  nav: NavItem[];
  pages: Page[];
  boxUi: BoxUi;
  cards: Card[];
  starters: Starter[];
  glossary: GlossaryTerm[];
}

export interface EngineContext {
  boxId: string;
  now: number;
  newId: (prefix: string) => string;
  /** Known theme ids; theme.set is validated against them. */
  themeIds: string[];
  /** Known action ids for nav targets of kind "action". */
  actionIds: string[];
  /** Known boxes for nav targets of kind "box". */
  boxes: Array<{ id: string; name: string }>;
}

export type ChangeRegion = 'skin' | 'nav' | 'shell' | 'theme' | 'style' | 'page' | 'canvas' | 'starters' | 'glossary';

/** A human-readable record of what changed, with before/after for diffs. */
export interface Change {
  region: ChangeRegion;
  text: string;
  before: string | null;
  after: string | null;
}

export type ApplyResult =
  | { ok: true; state: UiState; inverse: Op[]; applied: Op[]; changes: Change[] }
  | { ok: false; index: number; op: Op; reason: string };

class OpError extends Error {}

function norm(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findOne<T>(list: T[], ref: string, id: (item: T) => string, name: (item: T) => string, what: string): T {
  const byId = list.find((item) => id(item) === ref);
  if (byId) {
    return byId;
  }
  const matches = list.filter((item) => norm(name(item)) === norm(ref));
  if (matches.length === 1) {
    return matches[0] as T;
  }
  if (matches.length > 1) {
    throw new OpError(`Two ${what}s are called "${ref}"; use its id (${matches.map(id).join(', ')})`);
  }
  throw new OpError(`No ${what} called "${ref}"`);
}

/** People read names, never ids (C-081): "the page 'Theme Gallery'", not "page:page-f4aa…". */
function describeTarget(target: NavTarget | null, state?: UiState): string {
  if (target === null) {
    return 'a group';
  }
  if (target.kind === 'page') {
    const page = state?.pages.find((candidate) => candidate.id === target.ref || norm(candidate.title) === norm(target.ref));
    return `the page '${page?.title ?? target.ref}'`;
  }
  if (target.kind === 'url') {
    return target.ref;
  }
  return `${target.kind} '${target.ref}'`;
}

function sameTarget(a: NavTarget | null, b: NavTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.ref === b.ref;
}

function nextOrder(nav: NavItem[], parent: string | null): number {
  const siblings = nav.filter((item) => item.parent_id === parent);
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((item) => item.order)) + 1;
}

function checkTarget(target: NavTarget | null | undefined, state: UiState, ctx: EngineContext): NavTarget | null {
  if (!target) {
    return null;
  }
  switch (target.kind) {
    case 'page': {
      const page = findOne(state.pages, target.ref, (p) => p.id, (p) => p.title, 'page');
      return { kind: 'page', ref: page.id };
    }
    case 'box': {
      const box = findOne(ctx.boxes, target.ref, (b) => b.id, (b) => b.name, 'box');
      return { kind: 'box', ref: box.id };
    }
    case 'action':
      if (ctx.actionIds.length > 0 && !ctx.actionIds.includes(target.ref)) {
        throw new OpError(`Unknown action "${target.ref}"`);
      }
      return target;
    case 'url':
      return target;
  }
}

function applyOne(state: UiState, op: Op, ctx: EngineContext): { state: UiState; inverse: Op[]; applied: Op; change: Change } {
  const { now } = ctx;
  switch (op.op) {
    case 'nav.add': {
      const parent = op.parent ? findOne(state.nav, op.parent, (n) => n.id, (n) => n.label, 'menu item') : null;
      const target = checkTarget(op.target, state, ctx);
      const id = op.id ?? ctx.newId('nav');
      if (state.nav.some((item) => item.id === id)) {
        throw new OpError(`Menu item id "${id}" already exists`);
      }
      const parentId = parent ? parent.id : null;
      const item: NavItem = {
        id,
        box_id: ctx.boxId,
        parent_id: parentId,
        label: op.label.trim(),
        target,
        order: op.position ?? nextOrder(state.nav, parentId),
        created_at: now,
        updated_at: now,
        ...(op.icon ? { icon: op.icon } : {}),
      };
      const where = parent ? `under '${parent.label}'` : 'at the top';
      return {
        state: { ...state, nav: [...state.nav, item] },
        inverse: [{ op: 'nav.remove', item: id }],
        applied: { ...op, id, parent: parentId, target },
        change: { region: 'nav', text: `added '${item.label}' ${where} in the sidebar`, before: null, after: `${pathLabel([...state.nav, item], id)} → ${describeTarget(target, state)}` },
      };
    }
    case 'nav.rename': {
      const item = findOne(state.nav, op.item, (n) => n.id, (n) => n.label, 'menu item');
      const nav = state.nav.map((n) => (n.id === item.id ? { ...n, label: op.label.trim(), updated_at: now } : n));
      return {
        state: { ...state, nav },
        inverse: [{ op: 'nav.rename', item: item.id, label: item.label }],
        applied: { ...op, item: item.id },
        change: { region: 'nav', text: `renamed '${item.label}' to '${op.label.trim()}' in the sidebar`, before: item.label, after: op.label.trim() },
      };
    }
    case 'nav.move': {
      const item = findOne(state.nav, op.item, (n) => n.id, (n) => n.label, 'menu item');
      const parent = op.parent ? findOne(state.nav, op.parent, (n) => n.id, (n) => n.label, 'menu item') : null;
      if (parent && subtree(state.nav, item.id).some((n) => n.id === parent.id)) {
        throw new OpError(`Cannot move '${item.label}' inside itself`);
      }
      const parentId = parent ? parent.id : null;
      const order = op.position ?? nextOrder(state.nav.filter((n) => n.id !== item.id), parentId);
      const nav = state.nav.map((n) => (n.id === item.id ? { ...n, parent_id: parentId, order, updated_at: now } : n));
      const from = item.parent_id ? pathLabel(state.nav, item.parent_id) : 'top';
      const to = parent ? parent.label : 'top';
      return {
        state: { ...state, nav },
        inverse: [{ op: 'nav.move', item: item.id, parent: item.parent_id, position: item.order }],
        applied: { ...op, item: item.id, parent: parentId, position: order },
        change: { region: 'nav', text: `moved '${item.label}' ${parent ? `under '${to}'` : 'to the top'} in the sidebar`, before: from, after: to },
      };
    }
    case 'nav.retarget': {
      const item = findOne(state.nav, op.item, (n) => n.id, (n) => n.label, 'menu item');
      const target = checkTarget(op.target, state, ctx);
      if (sameTarget(item.target, target)) {
        // A no-op is not an edit (C-081): nothing to undo, nothing to announce.
        throw new OpError(`'${item.label}' already opens ${describeTarget(target, state)}; nothing to change`);
      }
      const nav = state.nav.map((n) => (n.id === item.id ? { ...n, target, updated_at: now } : n));
      return {
        state: { ...state, nav },
        inverse: [{ op: 'nav.retarget', item: item.id, target: item.target }],
        applied: { ...op, item: item.id, target },
        change: { region: 'nav', text: `pointed '${item.label}' at ${describeTarget(target, state)}`, before: describeTarget(item.target, state), after: describeTarget(target, state) },
      };
    }
    case 'nav.remove': {
      const item = findOne(state.nav, op.item, (n) => n.id, (n) => n.label, 'menu item');
      const removed = subtree(state.nav, item.id);
      const gone = new Set(removed.map((n) => n.id));
      const extra = removed.length > 1 ? ` and ${removed.length - 1} nested item${removed.length > 2 ? 's' : ''}` : '';
      return {
        state: { ...state, nav: state.nav.filter((n) => !gone.has(n.id)) },
        inverse: [{ op: 'nav.restore', items: removed }],
        applied: { ...op, item: item.id },
        change: { region: 'nav', text: `removed '${item.label}'${extra} from the sidebar`, before: pathLabel(state.nav, item.id), after: null },
      };
    }
    case 'nav.restore': {
      for (const item of op.items) {
        if (state.nav.some((n) => n.id === item.id)) {
          throw new OpError(`Menu item "${item.id}" already exists`);
        }
      }
      const root = op.items[0];
      return {
        state: { ...state, nav: [...state.nav, ...op.items] },
        inverse: root ? [{ op: 'nav.remove', item: root.id }] : [],
        applied: op,
        change: { region: 'nav', text: `restored '${root?.label ?? ''}' in the sidebar`, before: null, after: root?.label ?? null },
      };
    }

    case 'shell.set': {
      const current = state.boxUi.dialect_text ?? defaultSpecText;
      let next: string | null;
      if (op.dialect_text === null) {
        next = null;
      } else if (op.replace) {
        const merged = mergeDialect(defaultSpecText, op.dialect_text);
        if (merged.issues.length > 0) {
          throw new OpError(`Layout dialect: ${merged.issues.map((issue) => issue.message).join('; ')}`);
        }
        next = merged.text;
      } else {
        const merged = mergeDialect(current, op.dialect_text);
        if (merged.issues.length > 0) {
          throw new OpError(`Layout dialect: ${merged.issues.map((issue) => issue.message).join('; ')}`);
        }
        next = merged.text;
      }
      return {
        state: { ...state, boxUi: { ...state.boxUi, dialect_text: next, updated_at: now } },
        inverse: [{ op: 'shell.set', dialect_text: state.boxUi.dialect_text, replace: true }],
        applied: op,
        change: { region: 'shell', text: `changed the layout (${op.dialect_text === null ? 'back to default' : op.dialect_text.trim()})`, before: current, after: next ?? defaultSpecText },
      };
    }
    case 'theme.set': {
      if (op.theme_id !== null && !ctx.themeIds.includes(op.theme_id)) {
        throw new OpError(`Unknown theme "${op.theme_id}". Themes: ${ctx.themeIds.join(', ')}`);
      }
      if (op.theme_id === state.boxUi.theme_id) {
        throw new OpError(`the theme is already ${op.theme_id ?? 'the default'}; nothing to change`);
      }
      return {
        state: { ...state, boxUi: { ...state.boxUi, theme_id: op.theme_id, updated_at: now } },
        inverse: [{ op: 'theme.set', theme_id: state.boxUi.theme_id }],
        applied: op,
        change: { region: 'theme', text: `switched the theme to ${op.theme_id ?? 'the default'}`, before: state.boxUi.theme_id, after: op.theme_id },
      };
    }
    case 'skin.apply': {
      const skins = { ...(state.boxUi.skins ?? {}) };
      const target = op.skin.target;
      const before = skins[target] ?? null;
      // Ops can arrive from anywhere (tools, the refine loop, undo): re-check the CSS every time.
      const checked = skinSchema.safeParse({ ...op.skin, id: op.skin.id ?? ctx.newId('skin'), created_at: op.skin.created_at || now });
      if (!checked.success) {
        throw new OpError(`Skin: ${checked.error.issues[0]?.path.join('.') ?? ''} ${checked.error.issues[0]?.message ?? 'invalid'}`.trim());
      }
      const skin: Skin = checked.data;
      skins[target] = skin;
      return {
        state: { ...state, boxUi: { ...state.boxUi, skins, updated_at: now } },
        inverse: before ? [{ op: 'skin.apply', skin: before }] : [{ op: 'skin.clear', target }],
        applied: { op: 'skin.apply', skin },
        change: {
          region: 'skin',
          text: `skinned the ${SKIN_TARGET_LABELS[target]} as '${skin.name}' (${SKIN_PATH_LABELS[skin.path]})`,
          before: before ? before.name : null,
          after: skin.name,
        },
      };
    }
    case 'skin.clear': {
      const skins = { ...(state.boxUi.skins ?? {}) };
      const before = skins[op.target] ?? null;
      delete skins[op.target];
      return {
        state: { ...state, boxUi: { ...state.boxUi, skins, updated_at: now } },
        inverse: before ? [{ op: 'skin.apply', skin: before }] : [],
        applied: op,
        change: { region: 'skin', text: `removed the skin from the ${SKIN_TARGET_LABELS[op.target]}`, before: before ? before.name : null, after: null },
      };
    }
    case 'style.set': {
      const style = { ...state.boxUi.style };
      const before = style[op.token] ?? null;
      if (op.value === null) {
        delete style[op.token];
      } else {
        style[op.token] = op.value;
      }
      return {
        state: { ...state, boxUi: { ...state.boxUi, style, updated_at: now } },
        inverse: [{ op: 'style.set', token: op.token, value: before }],
        applied: op,
        change: { region: 'style', text: `set ${op.token} to ${op.value ?? 'default'}`, before, after: op.value },
      };
    }

    case 'page.create': {
      const id = op.id ?? ctx.newId('page');
      if (state.pages.some((page) => page.id === id)) {
        throw new OpError(`Page id "${id}" already exists`);
      }
      const page: Page = { id, box_id: ctx.boxId, title: op.title.trim(), blocks: op.blocks, created_at: now, updated_at: now };
      return {
        state: { ...state, pages: [...state.pages, page] },
        inverse: [{ op: 'page.delete', page: id }],
        applied: { ...op, id },
        change: { region: 'page', text: `created the page '${page.title}' (${page.blocks.length} block${page.blocks.length === 1 ? '' : 's'})`, before: null, after: page.title },
      };
    }
    case 'page.rename': {
      const page = findOne(state.pages, op.page, (p) => p.id, (p) => p.title, 'page');
      return {
        state: { ...state, pages: state.pages.map((p) => (p.id === page.id ? { ...p, title: op.title.trim(), updated_at: now } : p)) },
        inverse: [{ op: 'page.rename', page: page.id, title: page.title }],
        applied: { ...op, page: page.id },
        change: { region: 'page', text: `renamed the page '${page.title}' to '${op.title.trim()}'`, before: page.title, after: op.title.trim() },
      };
    }
    case 'page.add_block': {
      const page = findOne(state.pages, op.page, (p) => p.id, (p) => p.title, 'page');
      const index = Math.min(op.index ?? page.blocks.length, page.blocks.length);
      const blocks = [...page.blocks.slice(0, index), op.block, ...page.blocks.slice(index)];
      return {
        state: { ...state, pages: state.pages.map((p) => (p.id === page.id ? { ...p, blocks, updated_at: now } : p)) },
        inverse: [{ op: 'page.remove_block', page: page.id, index }],
        applied: { ...op, page: page.id, index },
        change: { region: 'page', text: `added a ${op.block.kind} block to '${page.title}'`, before: null, after: op.block.kind },
      };
    }
    case 'page.update_block': {
      const page = findOne(state.pages, op.page, (p) => p.id, (p) => p.title, 'page');
      const old = page.blocks[op.index];
      if (!old) {
        throw new OpError(`Page '${page.title}' has no block ${op.index} (it has ${page.blocks.length})`);
      }
      const blocks = page.blocks.map((block, index) => (index === op.index ? op.block : block));
      return {
        state: { ...state, pages: state.pages.map((p) => (p.id === page.id ? { ...p, blocks, updated_at: now } : p)) },
        inverse: [{ op: 'page.update_block', page: page.id, index: op.index, block: old }],
        applied: { ...op, page: page.id },
        change: { region: 'page', text: `changed block ${op.index + 1} of '${page.title}'`, before: JSON.stringify(old), after: JSON.stringify(op.block) },
      };
    }
    case 'page.remove_block': {
      const page = findOne(state.pages, op.page, (p) => p.id, (p) => p.title, 'page');
      const old = page.blocks[op.index];
      if (!old) {
        throw new OpError(`Page '${page.title}' has no block ${op.index}`);
      }
      const blocks = page.blocks.filter((_block, index) => index !== op.index);
      return {
        state: { ...state, pages: state.pages.map((p) => (p.id === page.id ? { ...p, blocks, updated_at: now } : p)) },
        inverse: [{ op: 'page.add_block', page: page.id, block: old, index: op.index }],
        applied: { ...op, page: page.id },
        change: { region: 'page', text: `removed a ${old.kind} block from '${page.title}'`, before: old.kind, after: null },
      };
    }
    case 'page.delete': {
      const page = findOne(state.pages, op.page, (p) => p.id, (p) => p.title, 'page');
      return {
        state: { ...state, pages: state.pages.filter((p) => p.id !== page.id) },
        inverse: [{ op: 'page.restore', page }],
        applied: { ...op, page: page.id },
        change: { region: 'page', text: `deleted the page '${page.title}'`, before: page.title, after: null },
      };
    }
    case 'page.restore': {
      if (state.pages.some((p) => p.id === op.page.id)) {
        throw new OpError(`Page "${op.page.id}" already exists`);
      }
      return {
        state: { ...state, pages: [...state.pages, op.page] },
        inverse: [{ op: 'page.delete', page: op.page.id }],
        applied: op,
        change: { region: 'page', text: `restored the page '${op.page.title}'`, before: null, after: op.page.title },
      };
    }

    case 'card.add': {
      const card = makeCard(
        { title: op.title, kind: op.kind, href: op.href, ...(op.thickness_mm ? { thickness_mm: op.thickness_mm } : {}) },
        state.cards,
        now,
      );
      const withId = op.id ? { ...card, id: op.id } : card;
      if (op.id && state.cards.some((existing) => existing.id === op.id)) {
        throw new OpError(`Card id "${op.id}" already exists`);
      }
      return {
        state: { ...state, cards: [...state.cards, withId] },
        inverse: [{ op: 'card.remove', card: withId.id }],
        applied: { ...op, id: withId.id },
        change: { region: 'canvas', text: `added the card '${withId.title}' to the canvas`, before: null, after: withId.title },
      };
    }
    case 'card.remove': {
      const card = findOne(state.cards, op.card, (c) => c.id, (c) => c.title, 'card');
      return {
        state: { ...state, cards: state.cards.filter((c) => c.id !== card.id) },
        inverse: [{ op: 'card.restore', card }],
        applied: { ...op, card: card.id },
        change: { region: 'canvas', text: `removed the card '${card.title}' from the canvas`, before: card.title, after: null },
      };
    }
    case 'card.restore': {
      if (state.cards.some((c) => c.id === op.card.id)) {
        throw new OpError(`Card "${op.card.id}" already exists`);
      }
      return {
        state: { ...state, cards: [...state.cards, op.card] },
        inverse: [{ op: 'card.remove', card: op.card.id }],
        applied: op,
        change: { region: 'canvas', text: `restored the card '${op.card.title}'`, before: null, after: op.card.title },
      };
    }

    case 'starter.add': {
      const id = op.id ?? ctx.newId('starter').toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const firstWord = /^[A-Za-z]+/.exec(op.text.trim())?.[0]?.toLowerCase() ?? 'say';
      const starter: Starter = {
        id,
        text: op.text.trim(),
        verb: op.verb ?? firstWord,
        expects: op.expects ?? 'text',
        reveal: op.reveal ?? 'typewriter',
        tags: ['user'],
      };
      return {
        state: { ...state, starters: [...state.starters, starter] },
        inverse: [{ op: 'starter.remove', starter: id }],
        applied: { ...op, id },
        change: { region: 'starters', text: `added the starter "${starter.text}"`, before: null, after: starter.text },
      };
    }
    case 'starter.remove': {
      const starter = findOne(state.starters, op.starter, (s) => s.id, (s) => s.text, 'starter');
      return {
        state: { ...state, starters: state.starters.filter((s) => s.id !== starter.id) },
        inverse: [{ op: 'starter.restore', starter }],
        applied: { ...op, starter: starter.id },
        change: { region: 'starters', text: `removed the starter "${starter.text}"`, before: starter.text, after: null },
      };
    }
    case 'starter.restore': {
      return {
        state: { ...state, starters: [...state.starters, op.starter] },
        inverse: [{ op: 'starter.remove', starter: op.starter.id }],
        applied: op,
        change: { region: 'starters', text: `restored the starter "${op.starter.text}"`, before: null, after: op.starter.text },
      };
    }

    case 'glossary.add': {
      const id = op.id ?? ctx.newId('term');
      const caseSensitive = op.case_sensitive ?? op.text !== op.text.toLowerCase();
      const clash = state.glossary.find((term) => (caseSensitive ? term.text === op.text : norm(term.text) === norm(op.text)));
      if (clash && clash.type === op.type && (op.note ?? '') === (clash.note ?? '')) {
        throw new OpError(`'${op.text.trim()}' is already a ${op.type} here; nothing to change`);
      }
      const glossary = clash ? state.glossary.filter((term) => term.id !== clash.id) : state.glossary;
      const term: GlossaryTerm = { id, box_id: ctx.boxId, text: op.text.trim(), type: op.type, note: op.note ?? '', case_sensitive: caseSensitive, created_at: now };
      const inverse: Op[] = [{ op: 'glossary.remove', term: id }];
      if (clash) {
        inverse.push({ op: 'glossary.add', text: clash.text, type: clash.type, note: clash.note, case_sensitive: clash.case_sensitive, id: clash.id });
      }
      return {
        state: { ...state, glossary: [...glossary, term] },
        inverse,
        applied: { ...op, id, case_sensitive: caseSensitive },
        change: { region: 'glossary', text: `will always treat '${term.text}' as ${term.type} on this stage`, before: clash ? clash.type : null, after: term.type },
      };
    }
    case 'glossary.remove': {
      const term = findOne(state.glossary, op.term, (g) => g.id, (g) => g.text, 'glossary term');
      return {
        state: { ...state, glossary: state.glossary.filter((g) => g.id !== term.id) },
        inverse: [{ op: 'glossary.add', text: term.text, type: term.type, note: term.note, case_sensitive: term.case_sensitive, id: term.id }],
        applied: { ...op, term: term.id },
        change: { region: 'glossary', text: `forgot '${term.text}' as ${term.type}`, before: term.type, after: null },
      };
    }
  }
}

/**
 * Applies a batch atomically: either every op applies, or none does and the
 * first failure is reported. The returned inverse undoes the whole batch.
 */
export function applyOps(state: UiState, ops: Op[], ctx: EngineContext): ApplyResult {
  let current = state;
  const inverse: Op[] = [];
  const applied: Op[] = [];
  const changes: Change[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index] as Op;
    try {
      const result = applyOne(current, op, ctx);
      current = result.state;
      inverse.unshift(...result.inverse);
      applied.push(result.applied);
      changes.push(result.change);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, index, op, reason };
    }
  }
  return { ok: true, state: current, inverse, applied, changes };
}

export function summarize(changes: Change[]): string {
  if (changes.length === 0) {
    return 'Nothing changed.';
  }
  const text = changes.map((change) => change.text).join('; ');
  return `Edited: ${text}`;
}
