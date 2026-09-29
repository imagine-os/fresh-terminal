import { CARD_KINDS } from '../canvas/types';
import { CHIP_KINDS } from '../chips/types';
import { MODEL_BLOCK_KINDS, STEP_STATUSES, parseBlocks, type ReplyBlock } from '../reply/blocks';
import { REVEAL_PATTERNS, STARTER_EXPECTS } from '../starters/types';
import { SKIN_TARGETS } from '../ui/skin';
import { BLOCK_KINDS, NAV_TARGET_KINDS } from '../ui/types';
import { INTERNAL_OPS, opSchema, type Op, type OpName } from './schema';

/**
 * OpenAI-style function tools for OpenRouter. Function names cannot contain
 * dots, so `nav.add` is exposed as `nav_add`. `respond` carries the reply.
 */
export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export const RESPOND_TOOL = 'respond';

export function toolNameFor(op: OpName): string {
  return op.replace('.', '_');
}

export function opNameFor(tool: string): OpName | null {
  const name = tool.replace('_', '.') as OpName;
  const known = opSchema.options.map((option) => option.shape.op.value as OpName);
  return known.includes(name) && !INTERNAL_OPS.includes(name) ? name : null;
}

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const target = {
  type: ['object', 'null'],
  description:
    'Where the item goes. kind url + ref "pages/koi.html" for a site page; kind page + a page id/title for a page in this box; kind action + an action id; kind box + a box id/name. null or omit for a group heading that only holds children.',
  properties: { kind: { type: 'string', enum: [...NAV_TARGET_KINDS] }, ref: { type: 'string' } },
  required: ['kind', 'ref'],
};
const pageBlock = {
  type: 'object',
  description: 'A page block. Fields by kind: heading{text,level}, text{text}, list{items}, card{title,body}, button{label,action}, table{columns,rows}, image{url,alt}, embed{page}.',
  properties: {
    kind: { type: 'string', enum: [...BLOCK_KINDS] },
    text: { type: 'string' },
    level: { type: 'integer', minimum: 1, maximum: 3 },
    items: { type: 'array', items: { type: 'string' } },
    title: { type: 'string' },
    body: { type: 'string' },
    label: { type: 'string' },
    action: { type: 'string' },
    columns: { type: 'array', items: { type: 'string' } },
    rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
    url: { type: 'string' },
    alt: { type: 'string' },
    page: { type: 'string' },
  },
  required: ['kind'],
};
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false });

const OP_TOOLS: Array<{ op: OpName; description: string; parameters: Record<string, unknown> }> = [
  {
    op: 'nav.add',
    description: 'Add a sidebar menu item. To nest, add the parent first, then children with parent = the parent label (works within one batch).',
    parameters: obj(
      {
        label: str('Visible label, short.'),
        parent: str('Id or label of the parent item; omit for top level.'),
        target,
        icon: str('Optional one-character icon.'),
        position: { type: 'number', description: 'Optional sort order among siblings.' },
      },
      ['label'],
    ),
  },
  { op: 'nav.rename', description: 'Rename a sidebar menu item.', parameters: obj({ item: str('Id or current label.'), label: str('New label.') }, ['item', 'label']) },
  {
    op: 'nav.move',
    description: 'Move a sidebar item under another item, or to the top level with parent null.',
    parameters: obj({ item: str('Id or label.'), parent: { type: ['string', 'null'], description: 'Id or label of the new parent, or null.' }, position: { type: 'number' } }, ['item', 'parent']),
  },
  { op: 'nav.retarget', description: 'Change where a sidebar item links to.', parameters: obj({ item: str('Id or label.'), target }, ['item', 'target']) },
  { op: 'nav.remove', description: 'Remove a sidebar item and everything nested under it.', parameters: obj({ item: str('Id or label.') }, ['item']) },
  {
    op: 'shell.set',
    description:
      'Change the layout with the house dialect. Only the regions and sizes you mention change. Regions: Top bar, Bottom bar, Left sidebar, Right sidebar, Stage. Behaviours: hidden, collapsed, rail, full, floating. Sizes: phone, tablet, laptop, desk, wall. Example: "Left sidebar: rail on laptop." Also "Spacing: tight|cozy|roomy|airy." and "Material: flat|paper|glass|metal|glow."',
    parameters: obj({ dialect_text: str('One or more dialect statements.') }, ['dialect_text']),
  },
  { op: 'theme.set', description: 'Switch this box to a theme by id (see state.themes), or null for the default.', parameters: obj({ theme_id: { type: ['string', 'null'] } }, ['theme_id']) },
  {
    op: 'skin.apply',
    description:
      'Give one part of the interface a material made of CSS only (for images, textures from the web or several versions to choose from, answer with a reply suggesting "skin the <part> <material>", which runs the refine loop). target: shell|stage|sidebar|topbar|composer. tokens: --bg, --surface, --fg, --accent, --border as #hex. background: CSS gradients and colours only, no url(). veil: 0-90, how much plain background covers the material so text stays readable.',
    parameters: obj(
      {
        skin: obj(
          {
            target: { type: 'string', enum: [...SKIN_TARGETS] },
            name: str('Short name, e.g. "Brushed brass".'),
            path: { type: 'string', enum: ['procedural_code', 'css_tokens'] },
            tokens: { type: 'object', additionalProperties: { type: 'string' } },
            background: { type: ['string', 'null'] },
            veil: { type: 'number', minimum: 0, maximum: 90 },
            description: str('One sentence on the look.'),
          },
          ['target', 'name', 'path', 'tokens', 'background', 'veil', 'description'],
        ),
      },
      ['skin'],
    ),
  },
  { op: 'skin.clear', description: 'Remove the skin from one part (target: shell|stage|sidebar|topbar|composer).', parameters: obj({ target: { type: 'string', enum: [...SKIN_TARGETS] } }, ['target']) },
  {
    op: 'style.set',
    description: 'Override one CSS design token for this box, e.g. --accent: #ff7a00. value null restores the theme value. Tokens: --bg, --bg-elevated, --surface, --border, --fg, --fg-muted, --accent, --accent-fg, --radius.',
    parameters: obj({ token: str('CSS custom property, starting with --.'), value: { type: ['string', 'null'] } }, ['token', 'value']),
  },
  { op: 'page.create', description: 'Create a page in this box from blocks. Link it from the sidebar with nav_add target {kind:"page", ref:<title>}.', parameters: obj({ title: str('Page title.'), blocks: { type: 'array', items: pageBlock } }, ['title', 'blocks']) },
  { op: 'page.rename', description: 'Rename a page.', parameters: obj({ page: str('Id or title.'), title: str('New title.') }, ['page', 'title']) },
  { op: 'page.add_block', description: 'Insert a block into a page (at index, or at the end).', parameters: obj({ page: str('Id or title.'), block: pageBlock, index: { type: 'integer', minimum: 0 } }, ['page', 'block']) },
  { op: 'page.update_block', description: 'Replace the block at index (0-based) in a page.', parameters: obj({ page: str('Id or title.'), index: { type: 'integer', minimum: 0 }, block: pageBlock }, ['page', 'index', 'block']) },
  { op: 'page.remove_block', description: 'Remove the block at index from a page.', parameters: obj({ page: str('Id or title.'), index: { type: 'integer', minimum: 0 } }, ['page', 'index']) },
  { op: 'page.delete', description: 'Delete a page.', parameters: obj({ page: str('Id or title.') }, ['page']) },
  {
    op: 'card.add',
    description: 'Add a card to the master canvas.',
    parameters: obj({ title: str('Card title.'), kind: { type: 'string', enum: [...CARD_KINDS] }, href: str('pages/x.html, a URL, route:/plan or box:<id>.') }, ['title', 'kind', 'href']),
  },
  { op: 'card.remove', description: 'Remove a card from the canvas.', parameters: obj({ card: str('Id or title.') }, ['card']) },
  {
    op: 'starter.add',
    description: 'Add a suggested starting prompt to the suggestion strip.',
    parameters: obj({ text: str('The prompt text.'), expects: { type: 'string', enum: [...STARTER_EXPECTS] }, reveal: { type: 'string', enum: [...REVEAL_PATTERNS] } }, ['text']),
  },
  { op: 'starter.remove', description: 'Remove a user-added starter.', parameters: obj({ starter: str('Id or text.') }, ['starter']) },
  {
    op: 'glossary.add',
    description: 'Teach this box a word: always treat `text` as `type` (e.g. "Hoy" as org). Case-sensitive by default when the text has capitals.',
    parameters: obj({ text: str('The word or phrase.'), type: { type: 'string', enum: [...CHIP_KINDS] }, note: str('Optional context.'), case_sensitive: { type: 'boolean' } }, ['text', 'type']),
  },
  { op: 'glossary.remove', description: 'Forget a glossary term.', parameters: obj({ term: str('Id or text.') }, ['term']) },
];

const RESPOND: ToolDef = {
  type: 'function',
  function: {
    name: RESPOND_TOOL,
    description:
      'Your reply to the person, as blocks. Call exactly once, last. First block: summary (one line). Then only blocks that help. End with next (2-4 short follow-up commands).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['blocks'],
      properties: {
        blocks: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            description:
              'Fields by kind: summary{text}, kv{rows:[{key,value}]}, table{columns,rows}, steps{items:[{status:done|active|todo,text}]}, list{items}, code{lang,code}, diff{rows:[{label,before,after}]}, next{commands}, note{text}, error{text}.',
            properties: {
              kind: { type: 'string', enum: [...MODEL_BLOCK_KINDS] },
              text: { type: 'string' },
              rows: { type: 'array' },
              columns: { type: 'array', items: { type: 'string' } },
              items: { type: 'array' },
              lang: { type: 'string' },
              code: { type: 'string' },
              commands: { type: 'array', items: { type: 'string' } },
            },
            required: ['kind'],
          },
        },
      },
    },
  },
};

export const OP_TOOL_DEFS: ToolDef[] = OP_TOOLS.map((tool) => ({
  type: 'function',
  function: { name: toolNameFor(tool.op), description: tool.description, parameters: tool.parameters },
}));

export const ALL_TOOLS: ToolDef[] = [...OP_TOOL_DEFS, RESPOND];

export type ParsedCall =
  | { ok: true; kind: 'op'; op: Op }
  | { ok: true; kind: 'respond'; blocks: ReplyBlock[]; dropped: string[] }
  | { ok: false; reason: string };

function stripNulls(value: Record<string, unknown>, keep: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null && !keep.includes(key)) {
      continue;
    }
    out[key] = entry;
  }
  return out;
}

/** Turns one tool call (name + JSON arguments string) into a validated op or reply. */
export function parseToolCall(name: string, argumentsJson: string): ParsedCall {
  let args: unknown;
  try {
    args = argumentsJson.trim() === '' ? {} : JSON.parse(argumentsJson);
  } catch {
    return { ok: false, reason: `${name}: arguments are not valid JSON` };
  }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return { ok: false, reason: `${name}: arguments must be an object` };
  }
  if (name === RESPOND_TOOL) {
    const { blocks, dropped } = parseBlocks((args as { blocks?: unknown }).blocks);
    if (blocks.length === 0) {
      return { ok: false, reason: `respond: no valid blocks (${dropped.join('; ') || 'blocks missing'})` };
    }
    return { ok: true, kind: 'respond', blocks, dropped };
  }
  const opName = opNameFor(name);
  if (opName === null) {
    return { ok: false, reason: `Unknown tool "${name}"` };
  }
  // Models often send null for "not set"; only a few fields mean something with null.
  const cleaned = stripNulls(args as Record<string, unknown>, ['parent', 'target', 'theme_id', 'value', 'dialect_text']);
  if (opName === 'nav.add' && cleaned.parent === null) {
    delete cleaned.parent;
  }
  const parsed = opSchema.safeParse({ ...cleaned, op: opName });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `${name}: ${issue?.path.join('.') || 'arguments'} ${issue?.message ?? 'invalid'}` };
  }
  return { ok: true, kind: 'op', op: parsed.data };
}

export { STEP_STATUSES };
