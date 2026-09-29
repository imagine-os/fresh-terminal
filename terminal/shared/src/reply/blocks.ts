import { z } from 'zod';
import { skinRunSchema } from '../skins/run';

/**
 * Super-CLI reply blocks. The model answers with these through the `respond`
 * tool; the client adds `edits` and `diff` from what it actually applied.
 */
export const STEP_STATUSES = ['done', 'active', 'todo'] as const;

export const replyBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('summary'), text: z.string().min(1).max(300) }),
  z.object({ kind: z.literal('kv'), rows: z.array(z.object({ key: z.string().max(60), value: z.string().max(300) })).min(1).max(30) }),
  z.object({
    kind: z.literal('table'),
    columns: z.array(z.string().max(60)).min(1).max(10),
    rows: z.array(z.array(z.string().max(200)).max(10)).max(50),
  }),
  z.object({ kind: z.literal('steps'), items: z.array(z.object({ status: z.enum(STEP_STATUSES), text: z.string().max(200) })).min(1).max(20) }),
  z.object({ kind: z.literal('list'), items: z.array(z.string().max(300)).min(1).max(30) }),
  z.object({ kind: z.literal('code'), lang: z.string().max(20).default(''), code: z.string().max(6000) }),
  z.object({
    kind: z.literal('diff'),
    rows: z.array(z.object({ label: z.string().max(120), before: z.string().max(400).nullable(), after: z.string().max(400).nullable() })).min(1).max(30),
  }),
  z.object({ kind: z.literal('edits'), batch_id: z.string(), summary: z.string().max(600) }),
  z.object({ kind: z.literal('next'), commands: z.array(z.string().min(1).max(80)).min(1).max(4) }),
  z.object({ kind: z.literal('note'), text: z.string().min(1).max(600) }),
  z.object({ kind: z.literal('error'), text: z.string().min(1).max(600) }),
  z.object({ kind: z.literal('text'), text: z.string().max(8000) }),
  /** A skin run: rounds of variants with scores (client-only, pass 5). */
  z.object({ kind: z.literal('refine'), run: skinRunSchema }),
]);
export type ReplyBlock = z.infer<typeof replyBlockSchema>;

export interface ReplyMeta {
  intent: string;
  model: string;
  ms: number;
  cost_micro: number;
  /** C-103: the part of cost_micro that is markup (price - model cost); 0 or absent inside the starter kit and with your key. */
  markup_micro?: number;
  /** C-105: the markup rate on this turn, in basis points (the account's choice, 10% by default). */
  markup_bp?: number;
  source?: 'jev' | 'rules' | 'local';
  /** Ledger entries this turn wrote, so Actions can take model and cost from the ledger exactly. */
  ledger_ids?: string[];
}

export interface Reply {
  meta: ReplyMeta | null;
  blocks: ReplyBlock[];
}

/** Blocks the model may send; `edits` is client-only. */
export const MODEL_BLOCK_KINDS = ['summary', 'kv', 'table', 'steps', 'list', 'code', 'diff', 'next', 'note', 'error'] as const;

/**
 * Parses blocks leniently: invalid blocks are dropped with a reason, never
 * fatal, so one bad table does not lose the whole reply.
 */
export function parseBlocks(raw: unknown): { blocks: ReplyBlock[]; dropped: string[] } {
  const blocks: ReplyBlock[] = [];
  const dropped: string[] = [];
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    const parsed = replyBlockSchema.safeParse(item);
    if (parsed.success && parsed.data.kind !== 'edits' && parsed.data.kind !== 'refine') {
      blocks.push(parsed.data);
    } else {
      const kind = typeof item === 'object' && item !== null && 'kind' in item ? String((item as { kind: unknown }).kind) : '?';
      dropped.push(`block "${kind}": ${parsed.success ? 'edits and refine blocks are added by the client' : parsed.error.issues[0]?.message ?? 'invalid'}`);
    }
  }
  return { blocks, dropped };
}

/** Plain text fallback: the model streamed prose instead of calling respond. */
export function textToBlocks(text: string): ReplyBlock[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const [first, ...rest] = trimmed.split(/\n+/);
  const blocks: ReplyBlock[] = [{ kind: 'summary', text: (first ?? '').slice(0, 300) }];
  if (rest.length > 0) {
    blocks.push({ kind: 'text', text: rest.join('\n') });
  }
  return blocks;
}
