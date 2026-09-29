import { PRODUCT_NAME } from '@shared/brand';
import type { Chip } from '@shared/chips';
import { dollarsToMicro, entryDraftSchema, type EntryDraft } from '@shared/ledger';
import { detectIntent, resolveRoute, type RouteTable } from '@shared/routing';
import rulesJson from '@router/rules.json';
import type { RouteDone, RouteHandlers } from './routerClient';

/**
 * "Bring your own OpenRouter key": the browser calls OpenRouter directly.
 * The key never touches our router. OpenRouter allows browser CORS and asks
 * for HTTP-Referer and X-Title for attribution. The ledger still records the
 * call, with price = cost and margin 0, so balances and the chain stay whole.
 */
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const ROUTE_TABLE = rulesJson as RouteTable;

export interface DirectRequest {
  boxId: string;
  text: string;
  chips: Chip[];
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

export interface DirectOptions {
  apiKey: string;
  referer: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  table?: RouteTable;
}

const SYSTEM_PROMPT = `You are the assistant inside ${PRODUCT_NAME}, a prompt-first terminal. Reply plainly and briefly. No marketing tone.`;

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
}

interface ChunkShape {
  id?: string;
  model?: string;
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: Usage;
  error?: { message?: string };
}

function parseSseLine(line: string): ChunkShape | null {
  if (!line.startsWith('data:')) {
    return null;
  }
  const payload = line.slice(5).trim();
  if (payload === '' || payload === '[DONE]') {
    return null;
  }
  try {
    return JSON.parse(payload) as ChunkShape;
  } catch {
    return null;
  }
}

export async function streamDirect(request: DirectRequest, options: DirectOptions, handlers: RouteHandlers): Promise<void> {
  const table = options.table ?? ROUTE_TABLE;
  let route = resolveRoute(detectIntent(request.text, table), table);
  if (route.kind !== 'chat') {
    // Decisions and tagger tiers never answer the user; use the default chat tier.
    route = resolveRoute(table.default, table);
  }
  if (route.pending) {
    handlers.onFail({ kind: 'pending', note: route.note ?? 'pending tier' });
    return;
  }
  handlers.onMeta?.({ route: { ...route, marginBasisPoints: 0 } });

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': options.referer,
        'X-Title': PRODUCT_NAME,
      },
      body: JSON.stringify({
        model: route.model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...request.history, { role: 'user', content: request.text }],
        stream: true,
        usage: { include: true },
      }),
    });
  } catch {
    handlers.onFail({ kind: 'error', message: 'Could not reach OpenRouter from this browser' });
    return;
  }

  if (!response.ok || response.body === null) {
    const body = await response.text().catch(() => '');
    handlers.onFail({ kind: 'error', message: `OpenRouter ${response.status}: ${body.slice(0, 200)}` });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: Usage | undefined;
  let generationId = '';
  let servedModel = '';
  let chars = 0;
  let failed = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const chunk = parseSseLine(buffer.slice(0, newline).trim());
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (chunk === null) {
        continue;
      }
      if (chunk.error?.message) {
        failed = true;
        handlers.onFail({ kind: 'error', message: chunk.error.message });
        continue;
      }
      if (!generationId && chunk.id) {
        generationId = chunk.id;
      }
      if (!servedModel && chunk.model) {
        servedModel = chunk.model;
      }
      const content = chunk.choices?.[0]?.delta?.content;
      if (typeof content === 'string' && content.length > 0) {
        chars += content.length;
        handlers.onDelta(content);
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }
  }

  const finalUsage: Usage = usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  // Own key: our cost is what OpenRouter reports, the price is the same, margin 0.
  const costMicro = typeof finalUsage.cost === 'number' && Number.isFinite(finalUsage.cost) ? dollarsToMicro(finalUsage.cost) : 0;
  const entry: EntryDraft = entryDraftSchema.parse({
    box_id: request.boxId,
    owner_identity: '',
    kind: 'charge',
    what: 'model.call.own-key',
    model: servedModel || route.model,
    units: 1,
    unit_kind: 'call',
    cost_micro: costMicro,
    price_micro: costMicro,
    ref: generationId,
    created_at: (options.now ?? Date.now)(),
  });

  const done: RouteDone = {
    ok: !failed,
    usage: finalUsage,
    served_model: servedModel || route.model,
    costSource: finalUsage.cost === undefined ? 'none' : 'openrouter',
    entry: failed ? null : entry,
    chars,
  };
  handlers.onDone(done);
}
