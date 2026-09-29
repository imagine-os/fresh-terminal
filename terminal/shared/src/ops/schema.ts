import { z } from 'zod';
import { CARD_KINDS, cardSchema } from '../canvas/types';
import { CHIP_KINDS } from '../chips/types';
import { REVEAL_PATTERNS, STARTER_EXPECTS, starterSchema } from '../starters/types';
import { STYLE_TOKEN, STYLE_VALUE, blockSchema, navItemSchema, navTargetSchema, pageSchema } from '../ui/types';

/**
 * The op language. Every change to the interface is one of these. References
 * to existing records (`item`, `parent`, `page`, `card`, `term`) accept an id
 * or, for convenience, a label/title (case-insensitive), so a model can write
 * a whole nested menu in one batch without knowing ids.
 *
 * Ops marked internal exist so every op has an exact inverse; they are not
 * offered to models as tools.
 */
const ref = z.string().min(1).max(120);

export const opSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('nav.add'),
    label: z.string().min(1).max(60),
    parent: ref.nullable().optional(),
    target: navTargetSchema.nullable().optional(),
    icon: z.string().max(4).optional(),
    position: z.number().optional(),
    /** Set by the engine on apply so redo and inverses are exact. */
    id: z.string().optional(),
  }),
  z.object({ op: z.literal('nav.rename'), item: ref, label: z.string().min(1).max(60) }),
  z.object({ op: z.literal('nav.move'), item: ref, parent: ref.nullable(), position: z.number().optional() }),
  z.object({ op: z.literal('nav.retarget'), item: ref, target: navTargetSchema.nullable() }),
  z.object({ op: z.literal('nav.remove'), item: ref }),
  z.object({ op: z.literal('nav.restore'), items: z.array(navItemSchema).min(1) }),

  z.object({
    op: z.literal('shell.set'),
    dialect_text: z.string().max(4000).nullable(),
    /** false (default) = patch only what the text mentions; true = replace. */
    replace: z.boolean().optional(),
  }),
  z.object({ op: z.literal('theme.set'), theme_id: z.string().min(1).max(40).nullable() }),
  z.object({
    op: z.literal('style.set'),
    token: z.string().regex(STYLE_TOKEN),
    value: z.string().regex(STYLE_VALUE).nullable(),
  }),

  z.object({ op: z.literal('page.create'), title: z.string().min(1).max(120), blocks: z.array(blockSchema).max(200).default([]), id: z.string().optional() }),
  z.object({ op: z.literal('page.rename'), page: ref, title: z.string().min(1).max(120) }),
  z.object({ op: z.literal('page.add_block'), page: ref, block: blockSchema, index: z.number().int().min(0).optional() }),
  z.object({ op: z.literal('page.update_block'), page: ref, index: z.number().int().min(0), block: blockSchema }),
  z.object({ op: z.literal('page.remove_block'), page: ref, index: z.number().int().min(0) }),
  z.object({ op: z.literal('page.delete'), page: ref }),
  z.object({ op: z.literal('page.restore'), page: pageSchema }),

  z.object({
    op: z.literal('card.add'),
    title: z.string().min(1).max(120),
    kind: z.enum(CARD_KINDS),
    href: z.string().min(1).max(300),
    thickness_mm: z.number().positive().max(50).optional(),
    id: z.string().optional(),
  }),
  z.object({ op: z.literal('card.remove'), card: ref }),
  z.object({ op: z.literal('card.restore'), card: cardSchema }),

  z.object({
    op: z.literal('starter.add'),
    text: z.string().min(1).max(120),
    verb: z.string().regex(/^[a-z]+$/).optional(),
    expects: z.enum(STARTER_EXPECTS).optional(),
    reveal: z.enum(REVEAL_PATTERNS).optional(),
    id: z.string().optional(),
  }),
  z.object({ op: z.literal('starter.remove'), starter: ref }),
  z.object({ op: z.literal('starter.restore'), starter: starterSchema }),

  z.object({
    op: z.literal('glossary.add'),
    text: z.string().min(1).max(80),
    type: z.enum(CHIP_KINDS),
    note: z.string().max(300).optional(),
    case_sensitive: z.boolean().optional(),
    id: z.string().optional(),
  }),
  z.object({ op: z.literal('glossary.remove'), term: ref }),
]);

export type Op = z.infer<typeof opSchema>;
export type OpName = Op['op'];

export const INTERNAL_OPS: OpName[] = ['nav.restore', 'page.restore', 'card.restore', 'starter.restore'];

export const opBatchSchema = z.array(opSchema).min(1).max(40);
