import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { PRODUCT_NAME, PRODUCT_VERSION } from '../../shared/src/brand';
import { entryDraftSchema, type EntryDraft } from '../../shared/src/ledger/types';
import { routeIntent } from './jev';
import {
  GEMINI_LIVE_MODEL,
  OPENAI_REALTIME_MODEL,
  OPENAI_TRANSCRIBE_MODEL,
  isMintFailure,
  mintGeminiSession,
  mintOpenAISession,
} from './realtime';
import { streamChat, type ChatMessage } from './openrouter';
import { tagWithModel } from './tagger';
import { costMicroFor, priceMicroFor, realtimePrice, type Usage } from './pricing';
import { allowedModels, detectIntent, isAllowedModel, loadRules, resolveRoute } from './rules';

/**
 * The router. Same code runs on Node (node.ts) and as a Cloudflare Worker
 * (worker.ts). It holds the OpenRouter key; the browser never sees it.
 */
export interface RouterBindings {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_DEFAULT_MODEL?: string;
  OPENROUTER_JEV_MODEL?: string;
  /** "false" disables Jev routing (rules only). Default on when a key exists. */
  ROUTER_USE_JEV?: string;
  OPENROUTER_TAGGER_MODEL?: string;
  /** Legacy single origin. Prefer ALLOWED_ORIGINS. */
  ROUTER_ALLOWED_ORIGIN?: string;
  /** Comma-separated list of allowed browser origins. */
  ALLOWED_ORIGINS?: string;
  ROUTER_REFERER?: string;
  /** Realtime voice: server-side only. */
  OPENAI_API_KEY?: string;
  OPENAI_REALTIME_MODEL?: string;
  OPENAI_TRANSCRIBE_MODEL?: string;
  GOOGLE_API_KEY?: string;
  GEMINI_LIVE_MODEL?: string;
}

/** Origins allowed by default: the GitHub Pages site and local dev/preview. */
export const DEFAULT_ALLOWED_ORIGINS = ['https://imagine-os.github.io', 'http://localhost:5173', 'http://localhost:4173'];

export function allowedOrigins(bindings: RouterBindings): string[] {
  const list = (bindings.ALLOWED_ORIGINS ?? bindings.ROUTER_ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (list.includes('*')) {
    return ['*'];
  }
  return list.length > 0 ? list : DEFAULT_ALLOWED_ORIGINS;
}

const routeBodySchema = z.object({
  boxId: z.string().min(1),
  text: z.string().min(1).max(20_000),
  chips: z.array(z.unknown()).default([]),
  /** Optional explicit model; must be in the allowlist (tier models + allowed_models). */
  model: z.string().min(1).max(200).optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string() }))
    .max(40)
    .default([]),
});

export type RouteBody = z.infer<typeof routeBodySchema>;

const tagBodySchema = z.object({ text: z.string().min(1).max(4000) });

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
    const origins = allowedOrigins(bindings);
    const origin = origins.includes('*') ? '*' : origins;
    return cors({ origin, allowMethods: ['GET', 'POST', 'OPTIONS'] })(c, next);
  });

  app.get('/health', (c) => {
    const bindings = options.bindings(c.env);
    return c.json({
      ok: true,
      product: PRODUCT_NAME,
      version: PRODUCT_VERSION,
      keyConfigured: Boolean(bindings.OPENROUTER_API_KEY),
      realtime: {
        openai: Boolean(bindings.OPENAI_API_KEY),
        gemini: Boolean(bindings.GOOGLE_API_KEY),
      },
    });
  });

  /** Which realtime voice providers this router can mint sessions for. */
  app.get('/realtime/providers', (c) => {
    const bindings = options.bindings(c.env);
    return c.json({
      providers: [
        {
          id: 'openai',
          configured: Boolean(bindings.OPENAI_API_KEY),
          model: bindings.OPENAI_REALTIME_MODEL ?? OPENAI_REALTIME_MODEL,
          transcribe_model: bindings.OPENAI_TRANSCRIBE_MODEL ?? OPENAI_TRANSCRIBE_MODEL,
          price: realtimePrice(bindings.OPENAI_REALTIME_MODEL ?? OPENAI_REALTIME_MODEL),
        },
        {
          id: 'gemini',
          configured: Boolean(bindings.GOOGLE_API_KEY),
          model: bindings.GEMINI_LIVE_MODEL ?? GEMINI_LIVE_MODEL,
          price: realtimePrice(bindings.GEMINI_LIVE_MODEL ?? GEMINI_LIVE_MODEL),
        },
      ],
    });
  });

  /** Mints a short-lived client credential; the browser then talks to the provider directly. */
  app.post('/realtime/session', async (c) => {
    const bindings = options.bindings(c.env);
    const provider = c.req.query('provider') ?? 'openai';
    if (provider === 'openai') {
      if (!bindings.OPENAI_API_KEY) {
        return c.json({ error: 'OPENAI_API_KEY is not set on the router' }, 503);
      }
      const session = await mintOpenAISession(
        bindings.OPENAI_API_KEY,
        bindings.OPENAI_REALTIME_MODEL ?? OPENAI_REALTIME_MODEL,
        bindings.OPENAI_TRANSCRIBE_MODEL ?? OPENAI_TRANSCRIBE_MODEL,
        options.fetchImpl ? { fetchImpl: options.fetchImpl } : {},
      );
      if (isMintFailure(session)) {
        return c.json({ error: session.message }, 502);
      }
      return c.json({ ...session, price: realtimePrice(session.model) });
    }
    if (provider === 'gemini') {
      if (!bindings.GOOGLE_API_KEY) {
        return c.json({ error: 'GOOGLE_API_KEY is not set on the router' }, 503);
      }
      const session = await mintGeminiSession(bindings.GOOGLE_API_KEY, bindings.GEMINI_LIVE_MODEL ?? GEMINI_LIVE_MODEL, {
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.now ? { now: options.now } : {}),
      });
      if (isMintFailure(session)) {
        return c.json({ error: session.message }, 502);
      }
      return c.json({ ...session, price: realtimePrice(session.model) });
    }
    return c.json({ error: `Unknown provider "${provider}"` }, 400);
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
    return c.json({ default: table.default, tiers: table.tiers, rules: resolved, allowed_models: allowedModels(table) });
  });

  app.post('/route', async (c) => {
    const bindings = options.bindings(c.env);
    const parsed = routeBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
    }
    const body = parsed.data;
    const table = loadRules();
    const overrides = {
      ...(bindings.OPENROUTER_JEV_MODEL ? { jevModel: bindings.OPENROUTER_JEV_MODEL } : {}),
      ...(bindings.OPENROUTER_DEFAULT_MODEL ? { defaultModel: bindings.OPENROUTER_DEFAULT_MODEL } : {}),
    };
    if (body.model !== undefined && !isAllowedModel(body.model, table, overrides)) {
      return c.json({ error: `Model "${body.model}" is not allowed`, allowed: allowedModels(table) }, 400);
    }
    if (!bindings.OPENROUTER_API_KEY) {
      const intent = detectIntent(body.text, table);
      const route = resolveRoute(intent, table, overrides);
      return c.json(
        {
          error: 'OPENROUTER_API_KEY is not set on the router',
          hint: 'Copy terminal/router/.env.example to terminal/router/.env and add your key.',
          route,
        },
        503,
      );
    }

    const apiKey = bindings.OPENROUTER_API_KEY;

    // Intent routing: Jev (typed Choice over the table) with a rules-only fallback.
    const routing = await routeIntent(body.text, table, {
      apiKey,
      enabled: bindings.ROUTER_USE_JEV !== 'false',
      ...(bindings.OPENROUTER_JEV_MODEL ? { model: bindings.OPENROUTER_JEV_MODEL } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      fallback: (text) => detectIntent(text, table),
    });
    let route = resolveRoute(routing.intent, table, {
      ...overrides,
      ...(body.model !== undefined ? { requestedModel: body.model } : {}),
    });
    if (route.kind !== 'chat') {
      // A decisions or tagger tier never answers the user; answer with the default chat tier.
      route = resolveRoute(table.default, table, {
        ...overrides,
        ...(body.model !== undefined ? { requestedModel: body.model } : {}),
      });
    }
    if (route.pending) {
      return c.json({ error: `Tier "${route.tier}" is pending: ${route.note ?? 'no model available'}`, route }, 501);
    }
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...body.history,
      { role: 'user', content: body.text },
    ];

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'meta', data: JSON.stringify({ route, routing }) });

      let usage: Usage | undefined;
      let generationId = '';
      let servedModel = '';
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
          } else if (event.type === 'model' && event.model) {
            servedModel = event.model;
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
      // Price by the model that was actually served (openrouter/auto picks one).
      const billedModel = servedModel || route.model;
      const { costMicro: callCostMicro, source } = costMicroFor(billedModel, finalUsage);
      // The Jev routing call is part of serving this request: its cost is folded into the entry.
      const costMicro = callCostMicro + routing.costMicro;
      const priceMicro = priceMicroFor(costMicro, route.marginBasisPoints);

      // One charge entry per model call. owner_identity is filled by the
      // client (or the module reducer) because the router does not hold it.
      const entry: EntryDraft = entryDraftSchema.parse({
        box_id: body.boxId,
        owner_identity: '',
        kind: 'charge',
        what: 'model.call',
        model: billedModel,
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
          served_model: billedModel,
          routing,
          costSource: source,
          entry: failed ? null : entry,
          chars: outputText.length,
        }),
      });
    });
  });

  app.post('/tag', async (c) => {
    const bindings = options.bindings(c.env);
    const parsed = tagBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400);
    }
    if (!bindings.OPENROUTER_API_KEY) {
      return c.json({ error: 'OPENROUTER_API_KEY is not set on the router' }, 503);
    }
    const table = loadRules();
    const tier = table.tiers.tagger;
    const model = bindings.OPENROUTER_TAGGER_MODEL ?? tier?.model ?? 'google/gemini-2.5-flash-lite';
    const result = await tagWithModel({
      apiKey: bindings.OPENROUTER_API_KEY,
      model,
      text: parsed.data.text,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
    if (result === null) {
      return c.json({ chips: [], model, ok: false });
    }
    return c.json({ chips: result.chips, model: result.servedModel, ok: true, cost_micro: result.costMicro, ref: result.generationId });
  });

  return app;
}
