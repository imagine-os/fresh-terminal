import rulesJson from '../rules.json' with { type: 'json' };
import { ACTION_VERBS } from '../../shared/src/chips/tagger';

export interface Tier {
  model: string;
  status?: 'pending' | 'live';
  note?: string;
}

export interface RouteRule {
  intent: string;
  tier: string;
  permission: string;
  margin_bp: number;
}

export interface RouteTable {
  default: string;
  tiers: Record<string, Tier>;
  rules: RouteRule[];
}

export interface ResolvedRoute {
  intent: string;
  tier: string;
  model: string;
  permission: string;
  marginBasisPoints: number;
  pending: boolean;
  note?: string;
}

export interface TierOverrides {
  /** Overrides the model id of the "jev" tier. */
  jevModel?: string;
  /** Overrides the default model used by every tier whose model is openrouter/auto. */
  defaultModel?: string;
}

export function loadRules(): RouteTable {
  return rulesJson as RouteTable;
}

/**
 * Intent detection for routing: the first word of the text if it is one of the
 * house action verbs, else the table default. Deliberately dumb and local; the
 * JEV tier is where a model-based classifier would go.
 */
export function detectIntent(text: string, table: RouteTable = loadRules()): string {
  const first = /^\s*([A-Za-z]+)/.exec(text)?.[1]?.toLowerCase() ?? '';
  const knownIntent = table.rules.some((rule) => rule.intent === first);
  if (knownIntent || (ACTION_VERBS as readonly string[]).includes(first)) {
    return first;
  }
  return table.default;
}

export function resolveRoute(
  intent: string,
  table: RouteTable = loadRules(),
  overrides: TierOverrides = {},
): ResolvedRoute {
  const rule =
    table.rules.find((candidate) => candidate.intent === intent) ??
    table.rules.find((candidate) => candidate.intent === table.default);
  if (rule === undefined) {
    throw new Error(`Route table has no rule for "${intent}" and no default`);
  }
  const tier = table.tiers[rule.tier];
  if (tier === undefined) {
    throw new Error(`Route rule "${rule.intent}" points at unknown tier "${rule.tier}"`);
  }

  let model = tier.model;
  if (rule.tier === 'jev' && overrides.jevModel) {
    model = overrides.jevModel;
  } else if (model === 'openrouter/auto' && overrides.defaultModel) {
    model = overrides.defaultModel;
  }

  const pending = tier.status === 'pending' && !(rule.tier === 'jev' && overrides.jevModel);

  const resolved: ResolvedRoute = {
    intent: rule.intent,
    tier: rule.tier,
    model,
    permission: rule.permission,
    marginBasisPoints: rule.margin_bp,
    pending,
  };
  if (tier.note !== undefined) {
    resolved.note = tier.note;
  }
  return resolved;
}
