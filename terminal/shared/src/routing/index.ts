import { ACTION_VERBS } from '../chips/tagger';

/**
 * Route resolution shared by the router (server) and the browser-direct
 * path (bring-your-own-key). The table itself lives in router/rules.json.
 */
export type TierKind = 'chat' | 'decisions' | 'tagger' | 'image' | 'vision';

export interface Tier {
  model: string;
  /** chat answers the user; decisions (Jev) and tagger never do. Default chat. */
  kind?: TierKind;
  alternate?: string;
  /** Stronger model for retries and hard requests. */
  escalate_model?: string;
  status?: 'pending' | 'live';
  note?: string;
}

export interface RouteRule {
  intent: string;
  tier: string;
  permission: string;
  margin_bp: number;
}

export interface EscalationRule {
  min_confidence: number;
  max_nav_items: number;
  max_pages: number;
}

/** refine() loop parameters for skins (pass 5). Estimates are per variant, micro-dollars. */
export interface RefineRule {
  variants: number;
  target_score: number;
  patience: number;
  max_rounds: number;
  cap_micro: number;
  estimate_micro: Record<string, number>;
}

export interface RouteTable {
  default: string;
  escalation?: EscalationRule;
  refine?: RefineRule;
  /** Extra model ids a request may pick explicitly. Tier models are always allowed. */
  allowed_models?: string[];
  tiers: Record<string, Tier>;
  rules: RouteRule[];
}

export interface ResolvedRoute {
  intent: string;
  tier: string;
  kind: TierKind;
  model: string;
  escalateModel?: string;
  permission: string;
  marginBasisPoints: number;
  pending: boolean;
  note?: string;
}

export interface TierOverrides {
  /** Overrides the model id of the "jev" tier. */
  jevModel?: string;
  /** Overrides the model of every live (non-pending) tier. */
  defaultModel?: string;
  /** A model the request picked explicitly; must pass allowedModels(). */
  requestedModel?: string;
}

/** Models a request may ask for by name: every tier model plus allowed_models. */
export function allowedModels(table: RouteTable): string[] {
  const set = new Set<string>(table.allowed_models ?? []);
  for (const tier of Object.values(table.tiers)) {
    if (tier.status !== 'pending' && (tier.kind ?? 'chat') === 'chat') {
      set.add(tier.model);
    }
  }
  return [...set];
}

export function isAllowedModel(model: string, table: RouteTable, overrides: TierOverrides = {}): boolean {
  const extra = [overrides.defaultModel, overrides.jevModel].filter((value): value is string => Boolean(value));
  return allowedModels(table).includes(model) || extra.includes(model);
}

/**
 * Intent detection for routing: the first word of the text if it is a known
 * intent or one of the house action verbs, else the table default.
 */
export function detectIntent(text: string, table: RouteTable): string {
  const first = /^\s*([A-Za-z]+)/.exec(text)?.[1]?.toLowerCase() ?? '';
  const knownIntent = table.rules.some((rule) => rule.intent === first);
  if (knownIntent || (ACTION_VERBS as readonly string[]).includes(first)) {
    return first;
  }
  return table.default;
}

export function resolveRoute(intent: string, table: RouteTable, overrides: TierOverrides = {}): ResolvedRoute {
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
  } else if (tier.status !== 'pending' && (tier.kind ?? 'chat') === 'chat' && overrides.defaultModel) {
    model = overrides.defaultModel;
  }
  if (overrides.requestedModel && isAllowedModel(overrides.requestedModel, table, overrides)) {
    model = overrides.requestedModel;
  }

  const pending =
    tier.status === 'pending' && !(rule.tier === 'jev' && overrides.jevModel) && !overrides.requestedModel;

  const resolved: ResolvedRoute = {
    intent: rule.intent,
    tier: rule.tier,
    kind: tier.kind ?? 'chat',
    model,
    permission: rule.permission,
    marginBasisPoints: rule.margin_bp,
    pending,
  };
  if (tier.note !== undefined) {
    resolved.note = tier.note;
  }
  if (tier.escalate_model !== undefined && !overrides.requestedModel) {
    resolved.escalateModel = tier.escalate_model;
  }
  return resolved;
}
