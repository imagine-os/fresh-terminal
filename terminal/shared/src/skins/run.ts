import { z } from 'zod';
import { SKIN_PATHS, SKIN_TARGETS, skinSchema } from '../ui/skin';

/**
 * A skin run as stored on its transcript line: the request, the path Jev
 * picked, every round's variants (full skins, so any of them can be applied
 * later), the stop reason and the spend. Images are referenced, not inlined.
 */
export const RUN_STATUSES = ['planning', 'running', 'done'] as const;

export const runVariantSchema = z.object({
  skin: skinSchema,
  score: z.number().min(0).max(5).nullable(),
  note: z.string().max(600),
});
export type RunVariant = z.infer<typeof runVariantSchema>;

export const skinRunSchema = z.object({
  id: z.string().min(1).max(80),
  box_id: z.string(),
  request: z.string().max(600),
  material: z.string().max(300),
  target: z.enum(SKIN_TARGETS),
  path: z.enum(SKIN_PATHS).nullable(),
  path_source: z.enum(['jev', 'rules']).nullable(),
  status: z.enum(RUN_STATUSES),
  reason: z.string().max(40).nullable(),
  error: z.string().max(400).nullable(),
  spent_micro: z.number().int().min(0),
  cap_micro: z.number().int().min(0),
  draft: skinSchema.nullable(),
  rounds: z
    .array(z.object({ round: z.number().int().min(1), winner: z.number().int().min(0), variants: z.array(runVariantSchema).max(3) }))
    .max(10),
  /** The variant id currently applied from this run (winner, or the one the user picked). */
  applied: z.string().nullable(),
  started_at: z.number(),
  finished_at: z.number().nullable(),
});
export type SkinRun = z.infer<typeof skinRunSchema>;
