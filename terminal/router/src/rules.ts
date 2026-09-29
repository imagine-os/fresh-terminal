import rulesJson from '../rules.json' with { type: 'json' };
import {
  allowedModels,
  detectIntent as detectIntentShared,
  isAllowedModel,
  resolveRoute as resolveRouteShared,
  type ResolvedRoute,
  type RouteRule,
  type RouteTable,
  type Tier,
  type TierOverrides,
} from '../../shared/src/routing';

export type { ResolvedRoute, RouteRule, RouteTable, Tier, TierOverrides };
export { allowedModels, isAllowedModel };

export function loadRules(): RouteTable {
  return rulesJson as RouteTable;
}

export function detectIntent(text: string, table: RouteTable = loadRules()): string {
  return detectIntentShared(text, table);
}

export function resolveRoute(intent: string, table: RouteTable = loadRules(), overrides: TierOverrides = {}): ResolvedRoute {
  return resolveRouteShared(intent, table, overrides);
}
