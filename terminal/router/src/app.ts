import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { PRODUCT_NAME, PRODUCT_VERSION } from '../../shared/src/brand';
import { entryDraftSchema, type EntryDraft } from '../../shared/src/ledger/types';
import { systemMessages, userMessage } from '../../shared/src/agent/prompt';
import { parseChips, snapshotSchema, type Snapshot } from '../../shared/src/agent/snapshot';
import { runTurn, type RoundInfo } from '../../shared/src/agent/turn';
import { CHIP_KIND_DESCRIPTIONS, applyGlossary, isChipKind, mergeChips } from '../../shared/src/chips/merge';
import { isAmbiguous, type Chip, type ChipKind, type ChipReading } from '../../shared/src/chips/types';
import { defaultBoxUi } from '../../shared/src/ui/types';
import { disambiguateChips, routeIntent } from './jev';
import {
  GEMINI_LIVE_MODEL,
  OPENAI_REALTIME_MODEL,
  OPENAI_TRANSCRIBE_MODEL,
  isMintFailure,
  mintGeminiSession,
  mintOpenAISession,
} from './realtime';
import type { ChatMessage } from './openrouter';
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
  /** Typed chips; user and glossary chips are authoritative. Untyped legacy chips are dropped. */
  chips: z.array(z.unknown()).default([]),
  /** The box's own records (menu, pages, layout, theme ...). */
  snapshot: snapshotSchema.optional(),
  /** Optional explicit model; must be in the allowlist (tier models + allowed_models). */
  model: z.string().min(1).max(200).optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string() }))
    .max(40)
    .default([]),
});

export type RouteBody = z.infer<typeof routeBodySchema>;

const glossaryHintSchema = z.object({
  text: z.string().min(1).max(80),
  type: z.string().max(20),
  note: z.string().max(300).optional(),
  case_sensitive: z.boolean().optional(),
});

const tagBodySchema = z.object({
  text: z.string().min(1).max(4000),
  glossary: z.array(glossaryHintSchema).max(300).default([]),
  local: z.array(z.unknown()).max(60).default([]),
});

function emptySnapshot(boxId: string): Snapshot {
  return {
    box: { id: boxId, name: 'box' },
    nav: [],
    pages: [],
    boxUi: defaultBoxUi(boxId, 0),
    themes: [],
    actions: [],
    boxes: [{ id: boxId, name: 'box' }],
    starters: [],
    cards: [],
    glossary: [],
    effectiveThemeId: 'void',
  };
}

function typedChips(raw: unknown[]): Chip[] {
  return parseChips(raw);
}

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
    const snapshot = body.snapshot ?? emptySnapshot(body.boxId);
    const escalation = table.escalation ?? { min_confidence: 0.6, max_nav_items: 40, max_pages: 10 };
    const startEscalated =
      routing.intent === 'edit_ui' &&
      ((routing.source === 'jev' && (routing.confidence ?? 1) < escalation.min_confidence) ||
        snapshot.nav.length > escalation.max_nav_items ||
        snapshot.pages.length > escalation.max_pages);
    const chips = typedChips(body.chips);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemMessages(snapshot) },
      ...body.history.map((message): ChatMessage =>
        message.role === 'assistant' ? { role: 'assistant', content: message.content } : { role: message.role === 'system' ? 'user' : message.role, content: message.content },
      ),
      { role: 'user', content: userMessage(body.text, chips) },
    ];

    return streamSSE(c, async (stream) => {
      const started = (options.now ?? Date.now)();
      await stream.writeSSE({ event: 'meta', data: JSON.stringify({ route, routing, escalated: startEscalated }) });

      const turnOptions: Parameters<typeof runTurn>[0] = {
        apiKey,
        model: route.model,
        startEscalated,
        messages,
        snapshot,
        title: PRODUCT_NAME,
        onDelta: (text) => {
          void stream.writeSSE({ event: 'delta', data: JSON.stringify({ text }) });
        },
      };
      if (route.escalateModel) turnOptions.escalateModel = route.escalateModel;
      if (options.fetchImpl) turnOptions.fetchImpl = options.fetchImpl;
      if (options.now) turnOptions.now = options.now;
      if (bindings.ROUTER_REFERER) turnOptions.referer = bindings.ROUTER_REFERER;

      let failed = false;
      let rounds: RoundInfo[] = [];
      try {
        const result = await runTurn(turnOptions);
        rounds = result.rounds;
        if (result.error) {
          failed = true;
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: result.error }) });
        }
        if (result.ops.length > 0 || result.rejected.length > 0) {
          await stream.writeSSE({
            event: 'ops',
            data: JSON.stringify({ ops: result.ops, changes: result.changes, rejected: result.rejected }),
          });
        }
        await stream.writeSSE({ event: 'reply', data: JSON.stringify({ blocks: result.blocks }) });
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : String(error);
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message }) });
      }

      // Cost: every round's provider cost (or the price table), plus the Jev routing call.
      let callCostMicro = 0;
      let source = 'openrouter';
      for (const round of rounds) {
        const usage: Usage = round.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        const priced = costMicroFor(round.servedModel || round.model, usage);
        callCostMicro += priced.costMicro;
        if (priced.source !== 'openrouter') source = priced.source;
      }
      const last = rounds[rounds.length - 1];
      const billedModel = last?.servedModel || last?.model || route.model;
      const costMicro = callCostMicro + routing.costMicro;
      const priceMicro = priceMicroFor(costMicro, route.marginBasisPoints);

      // One charge entry per turn. owner_identity is filled by the client
      // (or the module reducer) because the router does not hold it.
      const entry: EntryDraft = entryDraftSchema.parse({
        box_id: body.boxId,
        owner_identity: '',
        kind: 'charge',
        what: 'model.call',
        model: billedModel,
        units: Math.max(1, rounds.length),
        unit_kind: 'call',
        cost_micro: costMicro,
        price_micro: priceMicro,
        ref: last?.generationId ?? '',
        created_at: (options.now ?? Date.now)(),
      });

      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({
          ok: !failed,
          usage: last?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          served_model: billedModel,
          routing,
          rounds: rounds.map((round) => ({ round: round.round, model: round.model, served_model: round.servedModel, tool_calls: round.toolCalls, rejected: round.rejected })),
          costSource: source,
          // The provider bills rounds that ran even when the turn failed, so they are ledgered too.
          entry: failed && costMicro === routing.costMicro ? null : entry,
          ms: (options.now ?? Date.now)() - started,
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
    const { text, glossary, local } = parsed.data;
    const table = loadRules();
    const tier = table.tiers.tagger;
    const model = bindings.OPENROUTER_TAGGER_MODEL ?? tier?.model ?? 'google/gemini-2.5-flash-lite';
    const result = await tagWithModel({
      apiKey: bindings.OPENROUTER_API_KEY,
      model,
      text,
      glossary: glossary.map((term) => ({ text: term.text, type: term.type, ...(term.note ? { note: term.note } : {}) })),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });

    const validGlossary = glossary
      .filter((term) => isChipKind(term.type))
      .map((term) => ({ text: term.text, type: term.type as ChipKind, note: term.note ?? '', case_sensitive: term.case_sensitive ?? term.text !== term.text.toLowerCase() }));
    let chips = applyGlossary(text, mergeChips(parseChips(local), result?.chips ?? []), validGlossary);

    // Ask Jev only about spans that are still ambiguous after merge and glossary.
    let jevCost = 0;
    let jevUsed = false;
    const ambiguous = chips.filter(isAmbiguous);
    if (ambiguous.length > 0 && bindings.ROUTER_USE_JEV !== 'false') {
      const spans = ambiguous.map((chip, index) => ({
        key: `chip_${index}`,
        text: chip.text,
        start: chip.start,
        end: chip.end,
        kinds: [...new Set([chip.kind, ...(chip.alternatives ?? []).map((reading) => reading.kind)])],
      }));
      const settled = await disambiguateChips(text, spans, (kind) => (isChipKind(kind) ? CHIP_KIND_DESCRIPTIONS[kind] : kind), {
        apiKey: bindings.OPENROUTER_API_KEY,
        ...(bindings.OPENROUTER_JEV_MODEL ? { model: bindings.OPENROUTER_JEV_MODEL } : {}),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
      if (settled) {
        jevUsed = true;
        jevCost = settled.costMicro;
        chips = chips.map((chip) => {
          const index = ambiguous.indexOf(chip);
          const answer = index === -1 ? undefined : settled.answers[`chip_${index}`];
          if (!answer || !isChipKind(answer.kind)) {
            return chip;
          }
          const alternatives: ChipReading[] = Object.entries(answer.probabilities)
            .filter(([kind, p]) => kind !== answer.kind && isChipKind(kind) && p > 0)
            .map(([kind, p]) => ({ kind: kind as ChipKind, p }))
            .sort((a, b) => b.p - a.p);
          const next: Chip = { ...chip, kind: answer.kind, p: answer.probabilities[answer.kind] ?? answer.confidence, source: 'model' };
          if (alternatives.length > 0) next.alternatives = alternatives;
          else delete next.alternatives;
          if (answer.kind !== 'date') delete next.value;
          return next;
        });
      }
    }

    return c.json({
      chips,
      model: result?.servedModel ?? model,
      ok: result !== null,
      cost_micro: (result?.costMicro ?? 0) + jevCost,
      ref: result?.generationId ?? '',
      jev: { used: jevUsed, cost_micro: jevCost },
    });
  });

  return app;
}
