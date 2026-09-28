import {
  FIT_WORDS,
  MATERIAL_WORDS,
  REGION_BEHAVIOURS,
  SIZE_CLASSES,
  SPACING_WORDS,
  TYPE_SCALE_WORDS,
  sameBehaviourEverywhere,
  shellSpecSchema,
  type FitWord,
  type MaterialWord,
  type PerSizeBehaviour,
  type RegionBehaviour,
  type RegionSpec,
  type ShellRegion,
  type ShellSpec,
  type SizeClass,
  type SpacingWord,
  type TypeScaleWord,
} from './types';

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParseResult {
  spec: ShellSpec;
  issues: ParseIssue[];
}

const REGION_ALIASES: Record<string, ShellRegion> = {
  'top bar': 'topBar',
  topbar: 'topBar',
  top: 'topBar',
  'bottom bar': 'bottomBar',
  bottombar: 'bottomBar',
  bottom: 'bottomBar',
  'left sidebar': 'leftSidebar',
  'left rail': 'leftSidebar',
  left: 'leftSidebar',
  'right sidebar': 'rightSidebar',
  'right rail': 'rightSidebar',
  right: 'rightSidebar',
  stage: 'stage',
  canvas: 'stage',
  main: 'stage',
};

const FIT_ALIASES: Record<string, FitWord> = {
  fills: 'fills',
  fill: 'fills',
  hugs: 'hugs',
  hug: 'hugs',
  wraps: 'wraps',
  wrap: 'wraps',
  stacks: 'stacks',
  stack: 'stacks',
  sitsbeside: 'sitsBeside',
  'sits beside': 'sitsBeside',
  pinstop: 'pinsTop',
  'pins top': 'pinsTop',
  pinsbottom: 'pinsBottom',
  'pins bottom': 'pinsBottom',
};

function lower(word: string): string {
  return word.trim().toLowerCase();
}

function isBehaviour(word: string): word is RegionBehaviour {
  return (REGION_BEHAVIOURS as readonly string[]).includes(word);
}

function isSize(word: string): word is SizeClass {
  return (SIZE_CLASSES as readonly string[]).includes(word);
}

function isSpacing(word: string): word is SpacingWord {
  return (SPACING_WORDS as readonly string[]).includes(word);
}

function isType(word: string): word is TypeScaleWord {
  return (TYPE_SCALE_WORDS as readonly string[]).includes(word);
}

function isMaterial(word: string): word is MaterialWord {
  return (MATERIAL_WORDS as readonly string[]).includes(word);
}

function lookupFit(word: string): FitWord | undefined {
  const key = lower(word).replace(/[-_]/g, ' ');
  return FIT_ALIASES[key] ?? FIT_ALIASES[key.replace(/\s+/g, '')];
}

function lookupRegion(name: string): ShellRegion | undefined {
  const key = lower(name).replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  return REGION_ALIASES[key] ?? REGION_ALIASES[key.replace(/\s+/g, '')];
}

/**
 * Splits a list like "desk and wall", "phone, tablet", "desk, wall and phone".
 */
function splitList(text: string): string[] {
  return text
    .split(/,|\band\b|&|\+/)
    .map(lower)
    .filter((part) => part.length > 0);
}

function emptyRegion(): RegionSpec {
  return { behaviour: sameBehaviourEverywhere('full') };
}

function defaultSpec(): ShellSpec {
  return {
    version: 0,
    regions: {
      topBar: emptyRegion(),
      bottomBar: emptyRegion(),
      leftSidebar: emptyRegion(),
      rightSidebar: emptyRegion(),
      stage: emptyRegion(),
    },
    spacing: 'cozy',
    material: 'flat',
  };
}

/**
 * Parses one behaviour clause, e.g.
 *   "rail on laptop, full on desk and wall, hidden on phone"
 *   "full everywhere"
 *   "hidden"
 * Returns the per-size map and any sizes not covered.
 */
function parseBehaviourClause(
  clause: string,
  lineNumber: number,
  issues: ParseIssue[],
): PerSizeBehaviour | undefined {
  const base: Partial<Record<SizeClass, RegionBehaviour>> = {};
  let everywhere: RegionBehaviour | undefined;
  let matchedAnything = false;

  const pattern = /([a-z]+)\s+(?:on|at|for)\s+([a-z ,&+]+?)(?=(?:,\s*[a-z]+\s+(?:on|at|for)\b)|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(clause)) !== null) {
    matchedAnything = true;
    const behaviour = lower(match[1] ?? '');
    const sizeList = match[2] ?? '';
    if (!isBehaviour(behaviour)) {
      issues.push({ line: lineNumber, message: `Unknown behaviour "${behaviour}"` });
      continue;
    }
    for (const size of splitList(sizeList)) {
      if (isSize(size)) {
        base[size] = behaviour;
      } else if (size === 'everywhere' || size === 'all') {
        everywhere = behaviour;
      } else {
        issues.push({ line: lineNumber, message: `Unknown size class "${size}"` });
      }
    }
  }

  if (!matchedAnything) {
    const words = lower(clause).replace(/\beverywhere\b|\ball\b/g, '').trim();
    if (isBehaviour(words)) {
      everywhere = words;
      matchedAnything = true;
    }
  }

  if (!matchedAnything) {
    return undefined;
  }

  const fallback: RegionBehaviour = everywhere ?? 'full';
  if (everywhere === undefined) {
    const missing = SIZE_CLASSES.filter((size) => base[size] === undefined);
    if (missing.length > 0 && missing.length < SIZE_CLASSES.length) {
      issues.push({
        line: lineNumber,
        message: `No behaviour given for ${missing.join(', ')}; using "full"`,
      });
    }
  }

  return {
    phone: base.phone ?? fallback,
    tablet: base.tablet ?? fallback,
    laptop: base.laptop ?? fallback,
    desk: base.desk ?? fallback,
    wall: base.wall ?? fallback,
  };
}

/**
 * Parses the plain-text dialect form into a ShellSpec.
 *
 * Grammar (one statement per line or per full stop):
 *   <Region>: <behaviour clause>[; <fit word>][; <spacing word>][; <type word>][; <material word>].
 *   Spacing: <spacing word>.
 *   Material: <material word>.
 *
 * Unknown words are reported as issues, never guessed.
 */
export function parseDialect(text: string): ParseResult {
  const spec = defaultSpec();
  const issues: ParseIssue[] = [];

  const statements = text
    .split(/\n|(?<=\.)\s+(?=[A-Z])/)
    .map((statement) => statement.trim().replace(/\.$/, '').trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('#'));

  statements.forEach((statement, index) => {
    const lineNumber = index + 1;
    const colon = statement.indexOf(':');
    if (colon === -1) {
      issues.push({ line: lineNumber, message: 'Expected "<Region>: ..."' });
      return;
    }
    const subject = statement.slice(0, colon).trim();
    const rest = statement.slice(colon + 1).trim();
    const subjectKey = lower(subject);

    if (subjectKey === 'spacing') {
      const word = lower(rest);
      if (isSpacing(word)) {
        spec.spacing = word;
      } else {
        issues.push({ line: lineNumber, message: `Unknown spacing "${rest}"` });
      }
      return;
    }

    if (subjectKey === 'material') {
      const word = lower(rest);
      if (isMaterial(word)) {
        spec.material = word;
      } else {
        issues.push({ line: lineNumber, message: `Unknown material "${rest}"` });
      }
      return;
    }

    const region = lookupRegion(subject);
    if (region === undefined) {
      issues.push({ line: lineNumber, message: `Unknown region "${subject}"` });
      return;
    }

    const target = spec.regions[region];
    const clauses = rest.split(';').map((clause) => clause.trim()).filter(Boolean);

    clauses.forEach((clause, clauseIndex) => {
      if (clauseIndex === 0) {
        const behaviour = parseBehaviourClause(clause, lineNumber, issues);
        if (behaviour !== undefined) {
          target.behaviour = behaviour;
          return;
        }
      }
      const word = lower(clause);
      const fit = lookupFit(word);
      if (fit !== undefined) {
        target.fit = fit;
      } else if (isSpacing(word)) {
        target.spacing = word;
      } else if (isType(word)) {
        target.type = word;
      } else if (isMaterial(word)) {
        target.material = word;
      } else {
        issues.push({ line: lineNumber, message: `Unknown word "${clause}"` });
      }
    });
  });

  const checked = shellSpecSchema.safeParse(spec);
  if (!checked.success) {
    issues.push({ line: 0, message: checked.error.message });
    return { spec: defaultSpec(), issues };
  }
  return { spec: checked.data, issues };
}

/**
 * Prints a ShellSpec back to the plain-text form. parse(print(spec)) is stable.
 */
export function printDialect(spec: ShellSpec): string {
  const regionLabels: Record<ShellRegion, string> = {
    topBar: 'Top bar',
    bottomBar: 'Bottom bar',
    leftSidebar: 'Left sidebar',
    rightSidebar: 'Right sidebar',
    stage: 'Stage',
  };

  const lines: string[] = [];
  for (const region of Object.keys(regionLabels) as ShellRegion[]) {
    const regionSpec = spec.regions[region];
    const groups = new Map<RegionBehaviour, SizeClass[]>();
    for (const size of SIZE_CLASSES) {
      const behaviour = regionSpec.behaviour[size];
      const list = groups.get(behaviour) ?? [];
      list.push(size);
      groups.set(behaviour, list);
    }
    let behaviourText: string;
    if (groups.size === 1) {
      behaviourText = `${[...groups.keys()][0]} everywhere`;
    } else {
      behaviourText = [...groups.entries()]
        .map(([behaviour, sizes]) => `${behaviour} on ${joinSizes(sizes)}`)
        .join(', ');
    }
    const extras: string[] = [];
    for (const value of [regionSpec.fit, regionSpec.spacing, regionSpec.type, regionSpec.material]) {
      if (value !== undefined) {
        extras.push(value);
      }
    }
    lines.push(`${regionLabels[region]}: ${[behaviourText, ...extras].join('; ')}.`);
  }
  lines.push(`Spacing: ${spec.spacing}.`);
  lines.push(`Material: ${spec.material}.`);
  return lines.join('\n');
}

function joinSizes(sizes: SizeClass[]): string {
  if (sizes.length === 1) {
    return sizes[0] as string;
  }
  return `${sizes.slice(0, -1).join(', ')} and ${sizes[sizes.length - 1]}`;
}

export const KNOWN_WORDS = {
  regions: Object.keys(REGION_ALIASES),
  behaviours: REGION_BEHAVIOURS,
  sizes: SIZE_CLASSES,
  fit: FIT_WORDS,
  spacing: SPACING_WORDS,
  type: TYPE_SCALE_WORDS,
  material: MATERIAL_WORDS,
};
