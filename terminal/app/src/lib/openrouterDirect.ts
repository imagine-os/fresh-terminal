import { PRODUCT_NAME } from '@shared/brand';
import { runTurn, systemMessages, turnCostMicro, userMessage, type ChatMessage, type Snapshot } from '@shared/agent';
import type { Chip } from '@shared/chips';
import { entryDraftSchema, type EntryDraft } from '@shared/ledger';
import { detectIntent, resolveRoute, type RouteTable } from '@shared/routing';
import rulesJson from '@router/rules.json';
import type { RouteDone, RouteHandlers } from './routerClient';

/**
 * "Bring your own OpenRouter key": the browser runs the same turn the router
 * runs (tools, validation against the box snapshot, one retry) straight
 * against OpenRouter. The key never touches our router. OpenRouter allows
 * browser CORS and asks for HTTP-Referer and X-Title. The ledger still
 * records the call, with price = cost and margin 0.
 */
export { OPENROUTER_URL } from '@shared/agent';

export const ROUTE_TABLE = rulesJson as unknown as RouteTable;

export interface DirectRequest {
  boxId: string;
  text: string;
  chips: Chip[];
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  snapshot: Snapshot;
}

export interface DirectOptions {
  apiKey: string;
  referer: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  table?: RouteTable;
}

export async function streamDirect(request: DirectRequest, options: DirectOptions, handlers: RouteHandlers): Promise<void> {
  const table = options.table ?? ROUTE_TABLE;
  const now = options.now ?? Date.now;
  const started = now();
  const intent = detectIntent(request.text, table);
  let route = resolveRoute(intent, table);
  if (route.kind !== 'chat') {
    // Decisions and tagger tiers never answer the user; use the default chat tier.
    route = resolveRoute(table.default, table);
  }
  handlers.onMeta?.({ route: { ...route, marginBasisPoints: 0 }, routing: { intent, source: 'rules', confidence: null, model: null, costMicro: 0 } });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemMessages(request.snapshot) },
    ...request.history.map((message): ChatMessage =>
      message.role === 'assistant' ? { role: 'assistant', content: message.content } : { role: 'user', content: message.content },
    ),
    { role: 'user', content: userMessage(request.text, request.chips) },
  ];

  const turnOptions: Parameters<typeof runTurn>[0] = {
    apiKey: options.apiKey,
    model: route.model,
    messages,
    snapshot: request.snapshot,
    referer: options.referer,
    title: PRODUCT_NAME,
    now,
    onDelta: handlers.onDelta,
  };
  if (route.escalateModel) turnOptions.escalateModel = route.escalateModel;
  if (options.fetchImpl) turnOptions.fetchImpl = options.fetchImpl;

  const result = await runTurn(turnOptions);
  if (result.error && result.rounds.every((round) => round.toolCalls === 0) && !result.text) {
    handlers.onFail({ kind: 'error', message: result.error });
    return;
  }
  if (result.ops.length > 0 || result.rejected.length > 0) {
    handlers.onOps?.({ ops: result.ops, changes: result.changes, rejected: result.rejected });
  }
  handlers.onReply?.(result.blocks);

  const last = result.rounds[result.rounds.length - 1];
  const costMicro = turnCostMicro(result.rounds);
  const servedModel = last?.servedModel || route.model;
  // Own key: our cost is what OpenRouter reports, the price is the same, margin 0.
  const entry: EntryDraft = entryDraftSchema.parse({
    box_id: request.boxId,
    owner_identity: '',
    kind: 'charge',
    what: 'model.call.own-key',
    model: servedModel,
    units: Math.max(1, result.rounds.length),
    unit_kind: 'call',
    cost_micro: costMicro,
    price_micro: costMicro,
    ref: last?.generationId ?? '',
    created_at: now(),
  });
  const done: RouteDone = {
    ok: result.ok,
    usage: last?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    served_model: servedModel,
    costSource: last?.usage?.cost === undefined ? 'none' : 'openrouter',
    entry,
    chars: result.text.length,
    ms: now() - started,
  };
  handlers.onDone(done);
}
