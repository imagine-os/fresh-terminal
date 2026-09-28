import { z } from 'zod';

/**
 * House dialect v0.
 *
 * A plain-language way to describe how the five-region shell behaves at each
 * size class. Every vocabulary word is a closed list so the parser can be
 * strict and the UI can be generated from the spec.
 */

export const SHELL_REGIONS = ['topBar', 'bottomBar', 'leftSidebar', 'rightSidebar', 'stage'] as const;
export type ShellRegion = (typeof SHELL_REGIONS)[number];

export const REGION_BEHAVIOURS = ['hidden', 'collapsed', 'rail', 'full', 'floating'] as const;
export type RegionBehaviour = (typeof REGION_BEHAVIOURS)[number];

export const SIZE_CLASSES = ['phone', 'tablet', 'laptop', 'desk', 'wall'] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

export const FIT_WORDS = ['fills', 'hugs', 'wraps', 'stacks', 'sitsBeside', 'pinsTop', 'pinsBottom'] as const;
export type FitWord = (typeof FIT_WORDS)[number];

export const SPACING_WORDS = ['tight', 'cozy', 'roomy', 'airy'] as const;
export type SpacingWord = (typeof SPACING_WORDS)[number];

export const TYPE_SCALE_WORDS = ['whisper', 'body', 'heading', 'headline', 'billboard'] as const;
export type TypeScaleWord = (typeof TYPE_SCALE_WORDS)[number];

export const MATERIAL_WORDS = ['flat', 'paper', 'glass', 'metal', 'glow'] as const;
export type MaterialWord = (typeof MATERIAL_WORDS)[number];

/**
 * Size class thresholds in em (root font size units) so nothing in the dialect
 * is a pixel. The shell measures its own container width and picks the first
 * class whose minimum is not exceeded.
 */
export const SIZE_CLASS_MIN_EM: Record<SizeClass, number> = {
  phone: 0,
  tablet: 40,
  laptop: 64,
  desk: 90,
  wall: 140,
};

export const regionBehaviourSchema = z.enum(REGION_BEHAVIOURS);
export const sizeClassSchema = z.enum(SIZE_CLASSES);
export const fitWordSchema = z.enum(FIT_WORDS);
export const spacingWordSchema = z.enum(SPACING_WORDS);
export const typeScaleWordSchema = z.enum(TYPE_SCALE_WORDS);
export const materialWordSchema = z.enum(MATERIAL_WORDS);

export const perSizeBehaviourSchema = z.object({
  phone: regionBehaviourSchema,
  tablet: regionBehaviourSchema,
  laptop: regionBehaviourSchema,
  desk: regionBehaviourSchema,
  wall: regionBehaviourSchema,
});
export type PerSizeBehaviour = z.infer<typeof perSizeBehaviourSchema>;

export const regionSpecSchema = z.object({
  behaviour: perSizeBehaviourSchema,
  fit: fitWordSchema.optional(),
  spacing: spacingWordSchema.optional(),
  type: typeScaleWordSchema.optional(),
  material: materialWordSchema.optional(),
});
export type RegionSpec = z.infer<typeof regionSpecSchema>;

export const shellSpecSchema = z.object({
  version: z.literal(0),
  regions: z.object({
    topBar: regionSpecSchema,
    bottomBar: regionSpecSchema,
    leftSidebar: regionSpecSchema,
    rightSidebar: regionSpecSchema,
    stage: regionSpecSchema,
  }),
  spacing: spacingWordSchema,
  material: materialWordSchema,
});
export type ShellSpec = z.infer<typeof shellSpecSchema>;

export function sameBehaviourEverywhere(behaviour: RegionBehaviour): PerSizeBehaviour {
  return { phone: behaviour, tablet: behaviour, laptop: behaviour, desk: behaviour, wall: behaviour };
}

/**
 * The default shell for this pass. Written out in the dialect in
 * defaultSpecText and parsed at startup so the text form is the source.
 */
export const defaultSpecText = [
  'Top bar: full everywhere; pinsTop; tight.',
  'Bottom bar: full everywhere; pinsBottom; cozy.',
  'Left sidebar: rail on laptop, full on desk and wall, hidden on phone and tablet.',
  'Right sidebar: hidden everywhere.',
  'Stage: full everywhere; fills; roomy; body.',
  'Spacing: cozy.',
  'Material: flat.',
].join('\n');

export function sizeClassForWidthEm(widthEm: number): SizeClass {
  let picked: SizeClass = 'phone';
  for (const size of SIZE_CLASSES) {
    if (widthEm >= SIZE_CLASS_MIN_EM[size]) {
      picked = size;
    }
  }
  return picked;
}
