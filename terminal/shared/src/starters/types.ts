import { z } from 'zod';

export const REVEAL_PATTERNS = ['beam-horizontal', 'beam-radial', 'beam-diagonal', 'typewriter', 'none'] as const;
export type RevealPattern = (typeof REVEAL_PATTERNS)[number];

export const STARTER_EXPECTS = ['text', 'component', 'page'] as const;
export type StarterExpects = (typeof STARTER_EXPECTS)[number];

export const starterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  text: z.string().min(1),
  verb: z.string().regex(/^[a-z]+$/),
  expects: z.enum(STARTER_EXPECTS),
  reveal: z.enum(REVEAL_PATTERNS),
  tags: z.array(z.string()),
});
export type Starter = z.infer<typeof starterSchema>;

export const startersFileSchema = z.object({
  starters: z.array(starterSchema).min(1),
});
