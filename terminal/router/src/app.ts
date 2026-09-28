import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { PRODUCT_NAME, PRODUCT_VERSION } from '../../shared/src/brand';
import { entryDraftSchema, type EntryDraft } from '../../shared/src/ledger/types';
import { streamChat, type ChatMessage } from './openrouter';
import { costMicroFor, priceMicroFor, type Usage } from './pricing';
import { detectIntent, loadRules, resolveRoute } from './rules';

/**
 * The router. Same code runs on Node (node.ts) and as a Cloudflare Worker
 * (worker.ts). It holds the OpenRouter key; the browser never sees it.
 */
export interface RouterBindings {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_DEFAULT_MODEL?: string;
  OPENROUTER_JEV_MODEL?: string;
  ROUTER_ALLOWED_ORIGIN?: string;
  ROUTER_REFERER?: string;
}

const routeBodySchema = z.object({
  boxId: z.string().min(1),
  text: z.string().min(1).max(20_000),
  chips: z.array(z.unknown()).default([]),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string() }))
    .max(40)
    .default([]),
});

export type RouteBody = z.infer<typeof routeBodySchema>;

const SYSTEM_PROMPT = `You are the assistant inside ${PRODUCT_NAME}, a prompt-first terminal. Reply plainly and briefly. When the user asks to make, build, show, list, add, remove, open, send, schedule or find something, describe the concrete result in one or two short paragraphs. No marketing tone.`;

export interface CreateAppOptions {
  /** Resolve bindings for a request. Node reads process.env; Workers read c.env. */
  bindings: (requestEnv: unknown) => RouterBindings;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createApp(options: CreateAppOptions) {
  const app = new Hono<{ Bindings: RouterBindings }>();

  app.use('*', async (c, next) => {
    const bindings = options.bindings(c.env);
    const origin = bindings.ROUTER_ALLOWED_ORIGIN ?? '*';
    return cors({ origin, allowMethods: ['GET', 'POST', 'OPTIONS'] })(c, next);
  });

  app.get('/health', (c) => {
    const bindings = options.bindings(c.env);
    return c.json({
      ok: true,
      product: PRODUCT_NAME,
      version: PRODUCT_VERSION,
      keyConfigured: Boolean(bindings.OPENROUTER_API_KEY),
    });
  });

  app.get('/rules', (c) => {
    const bindings = options.bindings(c.env);
    const table = loadRules();
    const resolved = table.rules.map((rule) =>
      resolveRoute(rule.intent, table, {
        ...(bindings.OPENROUTER_JEV_MODEL ? { jevModel: bindings.OPENROUTER_JEV_MODEL } : {}),
        ...(bindings.OPENROUTER_DEFAULT_MODEL ? { defaultModel: bindings.OPENROUTER_DEFAULT_MODEL } : {}),
      }),
    );
    return c.json({ default: table.default, tiers: table.tiers, rules: resolved });
  });

  app.post('/route', async (c) => {
    const bindings = options.bindings(c.env);
    const parsed = routeBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    }
    const body = parsed.data;
    const table = loadRules();
    const intent = detectIntent(body.text, table);
    const route = resolveRoute(intent, table, {
      ...(bindings.OPENROUTER_JEV_MODEL ? { jevModel: bindings.OPENROUTER_JEV_MODEL } : {}),
      ...(bindings.OPENROUTER_DEFAULT_MODEL ? { defaultModel: bindings.OPENROUTER_DEFAULT_MODEL } : {}),
    });

    if (!bindings.OPENROUTER_API_KEY) {
      return c.json(
        {
          error: 'OPENROUTER_API_KEY is not set on the router',
          hint: 'Copy terminal/router/.env.example to terminal/router/.env and add your key.',
          route,
        },
        503,
      );
    }

    if (route.pending) {
      return c.json(
        {
          error: `Tier "${route.tier}" is pending: ${route.note ?? 'no model available'}`,
          route,
        },
        501,
      );
    }

    const apiKey = bindings.OPENROUTER_API_KEY;
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...body.history,
      { role: 'user', content: body.text },
    ];

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'meta', data: JSON.stringify({ route }) });

      let usage: Usage | undefined;
      let generationId = '';
      let outputText = '';
      let failed = false;

      const streamOptions: Parameters<typeof streamChat>[0] = {
        apiKey,
        model: route.model,
        messages,
        title: PRODUCT_NAME,
      };
      if (bindings.ROUTER_REFERER) {
        streamOptions.referer = bindings.ROUTER_REFERER;
      }
      if (options.fetchImpl) {
        streamOptions.fetchImpl = options.fetchImpl;
      }

      try {
        for await (const event of streamChat(streamOptions)) {
          if (event.type === 'delta' && event.text) {
            outputText += event.text;
            await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: event.text }) });
          } else if (event.type === 'usage' && event.usage) {
            usage = event.usage;
          } else if (event.type === 'id' && event.id) {
            generationId = event.id;
          } else if (event.type === 'error') {
            failed = true;
            await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: event.message }) });
          }
        }
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : String(error);
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message }) });
      }

      const finalUsage: Usage = usage ?? {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
      const { costMicro, source } = costMicroFor(route.model, finalUsage);
      const priceMicro = priceMicroFor(costMicro, route.marginBasisPoints);

      // One charge entry per model call. owner_identity is filled by the
      // client (or the module reducer) because the router does not hold it.
      const entry: EntryDraft = entryDraftSchema.parse({
        box_id: body.boxId,
        owner_identity: '',
        kind: 'charge',
        what: 'model.call',
        units: 1,
        unit_kind: 'call',
        cost_micro: costMicro,
        price_micro: priceMicro,
        ref: generationId,
        created_at: (options.now ?? Date.now)(),
      });

      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({
          ok: !failed,
          usage: finalUsage,
          costSource: source,
          entry: failed ? null : entry,
          chars: outputText.length,
        }),
      });
    });
  });

  return app;
}
