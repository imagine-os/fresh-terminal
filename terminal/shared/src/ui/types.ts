import { z } from 'zod';
import { CHIP_KINDS } from '../chips/types';
import { STYLE_TOKEN, STYLE_VALUE } from './style';
import { skinSchema } from './skin';

/**
 * Everything the interface shows that a person might ask to change is a
 * record. The op language (shared/src/ops) is the only way to change them.
 */

export const NAV_TARGET_KINDS = ['box', 'page', 'url', 'action'] as const;
export type NavTargetKind = (typeof NAV_TARGET_KINDS)[number];

const safeRef = z
  .string()
  .min(1)
  .max(300)
  .refine((value) => !/^\s*javascript:/i.test(value) && !/^\s*data:/i.test(value), 'unsafe link');

export const navTargetSchema = z.object({
  kind: z.enum(NAV_TARGET_KINDS),
  ref: safeRef,
});
export type NavTarget = z.infer<typeof navTargetSchema>;

export const navItemSchema = z.object({
  id: z.string().min(1),
  box_id: z.string().min(1),
  parent_id: z.string().nullable(),
  label: z.string().min(1).max(60),
  icon: z.string().max(4).optional(),
  /** null = a group heading that only holds children. */
  target: navTargetSchema.nullable(),
  order: z.number(),
  created_at: z.number(),
  updated_at: z.number(),
});
export type NavItem = z.infer<typeof navItemSchema>;

export const blockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), text: z.string().min(1).max(200), level: z.number().int().min(1).max(3).default(2) }),
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(4000) }),
  z.object({ kind: z.literal('list'), items: z.array(z.string().max(300)).min(1).max(50) }),
  z.object({ kind: z.literal('card'), title: z.string().min(1).max(120), body: z.string().max(1000).default('') }),
  z.object({ kind: z.literal('button'), label: z.string().min(1).max(60), action: z.string().min(1).max(80) }),
  z.object({
    kind: z.literal('table'),
    columns: z.array(z.string().max(60)).min(1).max(12),
    rows: z.array(z.array(z.string().max(200)).max(12)).max(100),
  }),
  z.object({ kind: z.literal('image'), url: safeRef, alt: z.string().max(200).default('') }),
  z.object({ kind: z.literal('embed'), page: z.string().min(1).max(120) }),
]);
export type Block = z.infer<typeof blockSchema>;
export const BLOCK_KINDS = ['heading', 'text', 'list', 'card', 'button', 'table', 'image', 'embed'] as const;

export const pageSchema = z.object({
  id: z.string().min(1),
  box_id: z.string().min(1),
  title: z.string().min(1).max(120),
  blocks: z.array(blockSchema).max(200),
  created_at: z.number(),
  updated_at: z.number(),
});
export type Page = z.infer<typeof pageSchema>;

export { STYLE_TOKEN, STYLE_VALUE } from './style';

export const boxUiSchema = z.object({
  box_id: z.string().min(1),
  /** null = the product default layout. */
  dialect_text: z.string().max(4000).nullable(),
  /** null = the visitor's default theme. */
  theme_id: z.string().nullable(),
  style: z.record(z.string().regex(STYLE_TOKEN), z.string().regex(STYLE_VALUE)),
  /** Skins per target (pass 5). Missing on records saved before pass 5. */
  skins: z.record(z.string(), skinSchema).default({}),
  seeded: z.boolean(),
  updated_at: z.number(),
});
export type BoxUi = z.infer<typeof boxUiSchema>;

export const glossaryTermSchema = z.object({
  id: z.string().min(1),
  box_id: z.string().min(1),
  text: z.string().min(1).max(80),
  type: z.enum(CHIP_KINDS),
  note: z.string().max(300),
  case_sensitive: z.boolean(),
  created_at: z.number(),
});
export type GlossaryTerm = z.infer<typeof glossaryTermSchema>;

/** Static pages that ship with the site; nav items can link to them. */
export const SITE_PAGES = [
  { title: 'Library of terminals', ref: 'pages/library.html' },
  { title: 'Koi Pond', ref: 'pages/koi.html' },
  { title: 'Audit & recommendation', ref: 'pages/audit.html' },
] as const;

/** Default menu for a new box: things that used to be hard-coded links. */
/** One item to start: the person's own actions (C-090). Library and Canvas live in the tray and the library page. */
export const SEED_NAV: Array<{ label: string; icon: string; target: NavTarget }> = [
  { label: 'Actions', icon: '≡', target: { kind: 'action', ref: 'actions.open' } },
];

export function defaultBoxUi(boxId: string, now: number): BoxUi {
  return { box_id: boxId, dialect_text: null, theme_id: null, style: {}, skins: {}, seeded: false, updated_at: now };
}
