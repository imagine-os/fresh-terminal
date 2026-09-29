import type { Hono } from 'hono';
import { z } from 'zod';
import { entryDraftSchema, type EntryDraft } from '../../shared/src/ledger/types';
import { DEFAULT_REFINE } from '../../shared/src/refine/loop';
import type { RefineRule } from '../../shared/src/routing';
import { SKIN_LIBRARY, rankLibrary } from '../../shared/src/skins/library';
import { parseSkinRequest } from '../../shared/src/skins/request';
import { SKIN_PATHS, SKIN_TARGETS, SKIN_TARGET_LABELS, ensureReadable, isSafeBackground, type SkinPath, type SkinTarget } from '../../shared/src/ui/skin';
import { STYLE_TOKEN, STYLE_VALUE } from '../../shared/src/ui/style';
import type { CreateAppOptions, RouterBindings } from './app';
import { decide, type Answer, type Question } from './jev';
import { costMicroFor, priceMicroFor, type Usage } from './pricing';
import { loadRules } from './rules';

/**
 * Skins (pass 5). The app runs refine() and calls three small endpoints:
 *   POST /skin/plan      Jev picks the path (library, CSS, image search, image generation)
 *   POST /skin/variants  makes up to 3 variants on that path (or upgrades of the parent)
 *   POST /skin/score     a vision model describes image variants, Jev scores all of them 1–5
 * Every model or search call comes back as a ledger entry draft.
 */

export const OPENVERSE_URL = 'https://api.openverse.org/v1/images/';
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const USER_AGENT = 'FreshTerminal/0.1 (+https://github.com/imagine-os/fresh-terminal)';

export const PATH_CRITERIA: Record<SkinPath, string> = {
  library:
    'A ready-made procedural material from our library fits: brass, paper, glass, wood, marble, concrete, felt, carbon fibre, neon, ocean, leather, slate, green phosphor, amber CRT, ledger lines, hardware panel, night sky, e-ink. Free and instant.',
  procedural_code:
    'Custom CSS gradients and colours: abstract, geometric or pattern looks, colour moods, anything without photographic detail. About a quarter of a cent per version.',
  css_tokens: 'Only a recolour: palette words like warmer, calmer, blue, high contrast; no texture at all. About a quarter of a cent per version.',
  image_search:
    'A real photographic texture from openly licensed images (Openverse): natural or real-world surfaces and photos, like rust, moss, denim, a beach. Nearly free; the licence is recorded.',
  image_generate:
    'A generated picture: a specific scene or illustration that does not exist yet, when the user asks to generate, draw or paint an image. About 4 cents per image, more than the whole budget, so it can only run when the budget is raised.',
};

const SCORE_RUNGS = [
  'Not the requested material at all, or text on it would be unreadable',
  'Only vaguely related to the requested material',
  'Recognisably the requested material',
  'A convincing version of the material that keeps text readable',
  'Exactly the requested material, polished, and text stays readable',
];

function refineRule(): RefineRule {
  const table = loadRules();
  return (
    table.refine ?? {
      ...DEFAULT_REFINE,
      estimate_micro: { library: 150, css_tokens: 2500, procedural_code: 2500, image_search: 400, image_generate: 9000 },
    }
  );
}

function makeEntry(boxId: string, what: string, model: string, costMicro: number, ref: string, now: number, units = 1): EntryDraft {
  return entryDraftSchema.parse({
    box_id: boxId,
    owner_identity: '',
    kind: 'charge',
    what,
    model,
    units: Math.max(0, Math.round(units)),
    unit_kind: 'call',
    cost_micro: Math.max(0, Math.round(costMicro)),
    price_micro: priceMicroFor(Math.max(0, Math.round(costMicro)), 0),
    ref,
    created_at: now,
  });
}

interface ChatResult {
  ok: boolean;
  text: string;
  images: string[];
  usage: Usage | null;
  id: string;
  model: string;
  error?: string;
}

async function chatOnce(
  fetchImpl: typeof fetch,
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ChatResult> {
  try {
    const response = await fetchImpl(CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Fresh Terminal' },
      body: JSON.stringify({ ...body, usage: { include: true } }),
      ...(signal ? { signal } : {}),
    });
    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, text: '', images: [], usage: null, id: '', model: String(body.model), error: `OpenRouter ${response.status}: ${raw.slice(0, 200)}` };
    }
    const parsed = JSON.parse(raw) as {
      id?: string;
      model?: string;
      usage?: Usage;
      choices?: Array<{ message?: { content?: string | null; images?: Array<{ image_url?: { url?: string } }> } }>;
    };
    const message = parsed.choices?.[0]?.message;
    const images = (message?.images ?? []).map((image) => image.image_url?.url ?? '').filter((url) => url.startsWith('data:image/'));
    return { ok: true, text: message?.content ?? '', images, usage: parsed.usage ?? null, id: parsed.id ?? '', model: parsed.model ?? String(body.model) };
  } catch (error) {
    return { ok: false, text: '', images: [], usage: null, id: '', model: String(body.model), error: error instanceof Error ? error.message : String(error) };
  }
}

function costOf(result: ChatResult): number {
  return costMicroFor(result.model, result.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }).costMicro;
}

/** Expected rung (1–5) from Jev's per-level probabilities; falls back to the raw score. */
export function expectedScore(answer: Answer | undefined, rungs: string[] = SCORE_RUNGS): number | null {
  if (!answer || answer.type !== 'score') return null;
  const probabilities = answer.probabilities ?? {};
  let total = 0;
  let weighted = 0;
  rungs.forEach((rung, index) => {
    const p = probabilities[rung] ?? probabilities[String(index + 1)] ?? probabilities[String(index)];
    if (typeof p === 'number' && Number.isFinite(p)) {
      total += p;
      weighted += p * (index + 1);
    }
  });
  if (total > 0) return Math.round((weighted / total) * 100) / 100;
  const score = answer.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score >= 0 && score <= 1) return Math.round((1 + score * (rungs.length - 1)) * 100) / 100;
  return Math.max(1, Math.min(rungs.length, score));
}

/** JSON from a model reply that may be fenced or chatty. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

const cssVariantSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(600).default(''),
  tokens: z.record(z.string(), z.string()).default({}),
  background: z.string().nullable().default(null),
  veil: z.number().min(0).max(90).default(30),
});

export interface VariantOut {
  id: string;
  name: string;
  path: SkinPath;
  tokens: Record<string, string>;
  background: string | null;
  veil: number;
  description: string;
  image: null | {
    ref?: string;
    thumb?: string;
    width?: number;
    height?: number;
    title: string;
    creator: string;
    license: string;
    license_url: string;
    source_url: string;
    provider: 'openverse' | 'openrouter';
  };
  /** Generated images come back as data URLs; the app stores them and sets image.ref. */
  image_data?: string;
  openverse_id?: string;
}

/** Keeps only safe tokens and backgrounds; fixes unreadable text colours. */
export function cleanCssVariant(raw: unknown, id: string, path: SkinPath): VariantOut | null {
  const parsed = cssVariantSchema.safeParse(raw);
  if (!parsed.success) return null;
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data.tokens)) {
    const token = key.startsWith('--') ? key : `--${key}`;
    if (STYLE_TOKEN.test(token) && STYLE_VALUE.test(value)) tokens[token] = value.trim();
  }
  const background = parsed.data.background && isSafeBackground(parsed.data.background) ? parsed.data.background : null;
  if (Object.keys(tokens).length === 0 && background === null) return null;
  return {
    id,
    name: parsed.data.name,
    path,
    tokens: ensureReadable(tokens),
    background: path === 'css_tokens' ? null : background,
    veil: Math.min(60, parsed.data.veil),
    description: parsed.data.description,
    image: null,
  };
}

const LICENSE_LABELS: Record<string, string> = { cc0: 'CC0', pdm: 'Public Domain Mark', by: 'CC BY', 'by-sa': 'CC BY-SA' };

interface OpenverseImage {
  id: string;
  title?: string;
  url?: string;
  thumbnail?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  width?: number;
  height?: number;
}

/** Licences we can use in a product without asking: no NC, no ND. The "related" endpoint ignores the search filter, so every result is checked here. */
export const ALLOWED_LICENSES = new Set(['cc0', 'pdm', 'by', 'by-sa']);

export function openverseToVariant(image: OpenverseImage, round: number, index: number): VariantOut | null {
  if (!image.url || !/^https:\/\/[^\s"'()\\<>]+$/.test(image.url)) return null;
  if (!ALLOWED_LICENSES.has((image.license ?? '').toLowerCase())) return null;
  const license = image.license ?? '';
  const label = `${LICENSE_LABELS[license] ?? license.toUpperCase()}${image.license_version && license !== 'pdm' ? ` ${image.license_version}` : ''}`.trim();
  const title = (image.title ?? 'Untitled').slice(0, 200);
  const creator = (image.creator ?? 'unknown').slice(0, 200);
  const thumb = image.thumbnail && /^https:\/\/[^\s"'()\\<>]+$/.test(image.thumbnail) ? image.thumbnail : undefined;
  return {
    id: `ov-${round}-${index}-${image.id.slice(0, 12)}`,
    name: title.slice(0, 60),
    path: 'image_search',
    tokens: {},
    background: null,
    veil: 72,
    description: `${title} by ${creator} (${label}).`,
    image: {
      ref: image.url,
      ...(thumb ? { thumb } : {}),
      ...(image.width ? { width: image.width } : {}),
      ...(image.height ? { height: image.height } : {}),
      title,
      creator,
      license: label,
      license_url: image.license_url ?? '',
      source_url: image.foreign_landing_url ?? '',
      provider: 'openverse',
    },
    openverse_id: image.id,
  };
}

const planBody = z.object({ boxId: z.string().min(1), text: z.string().min(1).max(600) });

const parentSchema = z
  .object({
    name: z.string().max(80),
    description: z.string().max(800).default(''),
    tokens: z.record(z.string(), z.string()).default({}),
    background: z.string().max(2400).nullable().default(null),
    image_data: z.string().max(3_500_000).optional(),
    openverse_id: z.string().max(80).optional(),
    note: z.string().max(400).optional(),
  })
  .nullable()
  .default(null);

const variantsBody = z.object({
  boxId: z.string().min(1),
  path: z.enum(SKIN_PATHS),
  material: z.string().min(1).max(300),
  target: z.enum(SKIN_TARGETS),
  round: z.number().int().min(1).max(20),
  n: z.number().int().min(1).max(3),
  parent: parentSchema,
  exclude: z.array(z.string().max(120)).max(60).default([]),
});

const scoreBody = z.object({
  boxId: z.string().min(1),
  material: z.string().min(1).max(300),
  target: z.enum(SKIN_TARGETS),
  variants: z
    .array(
      z.object({
        id: z.string().max(120),
        description: z.string().max(800).default(''),
        /** data: URL (generated) or https URL (search thumbnail); null for CSS variants. */
        image: z.string().max(3_500_000).nullable().default(null),
      }),
    )
    .min(1)
    .max(3),
});

function rulesPath(text: string, material: string): SkinPath {
  if (/\b(generate|draw|paint|illustrat|picture of|scene)\b/i.test(text)) return 'image_generate';
  if (/\b(photo|photograph|real|realistic)\b/i.test(text)) return 'image_search';
  if ((rankLibrary(material)[0]?.hits ?? 0) > 0) return 'library';
  return 'procedural_code';
}

export function mountSkinRoutes(app: Hono<{ Bindings: RouterBindings }>, options: CreateAppOptions): void {
  const now = () => (options.now ?? Date.now)();
  const fetchImpl = options.fetchImpl ?? fetch;

  app.post('/skin/plan', async (c) => {
    const bindings = options.bindings(c.env);
    const parsed = planBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body' }, 400);
    const { boxId, text } = parsed.data;
    const { target, material } = parseSkinRequest(text);
    const params = refineRule();
    const entries: EntryDraft[] = [];
    let path: SkinPath = rulesPath(text, material);
    let source: 'jev' | 'rules' = 'rules';
    let confidence: number | null = null;
    let probabilities: Record<string, number> = {};
    if (bindings.OPENROUTER_API_KEY && bindings.ROUTER_USE_JEV !== 'false') {
      const question: Question = {
        type: 'choice',
        instructions: `Pick the best way to make the material "${material}" as a skin for the ${SKIN_TARGET_LABELS[target]} of an app, within a total budget of ${(params.cap_micro / 10_000).toFixed(1)} cents for up to ${params.variants} versions per round.`,
        criteria: { ...PATH_CRITERIA },
      };
      const decision = await decide({
        apiKey: bindings.OPENROUTER_API_KEY,
        state: { request: text, material, target },
        questions: { path: question },
        ...(bindings.OPENROUTER_JEV_MODEL ? { model: bindings.OPENROUTER_JEV_MODEL } : {}),
        fetchImpl,
      });
      const answer = decision?.answers.path;
      if (decision && answer?.type === 'choice' && (SKIN_PATHS as readonly string[]).includes(answer.choice)) {
        path = answer.choice as SkinPath;
        source = 'jev';
        confidence = answer.confidence;
        probabilities = answer.probabilities;
      }
      if (decision) {
        const cost = typeof decision.usage.cost === 'number' ? Math.round(decision.usage.cost * 1_000_000) : 0;
        entries.push(makeEntry(boxId, 'skin.plan', decision.model, cost, decision.id, now()));
      }
    }
    // Never plan a path the cap cannot afford even once; take the next best that fits and say so.
    let note: string | null = null;
    const estimate = (p: SkinPath) => params.estimate_micro[p] ?? 2500;
    if (estimate(path) > params.cap_micro) {
      const from = path;
      const ranked = (Object.entries(probabilities) as Array<[SkinPath, number]>)
        .filter(([candidate]) => (SKIN_PATHS as readonly string[]).includes(candidate) && estimate(candidate) <= params.cap_micro)
        .sort((a, b) => b[1] - a[1]);
      path = ranked[0]?.[0] ?? (from === 'image_generate' ? 'image_search' : 'procedural_code');
      note = `${from === 'image_generate' ? 'Image generation' : from} costs about ${(estimate(from) / 10_000).toFixed(1)}¢ per version, over the ${(params.cap_micro / 10_000).toFixed(0)}¢ cap, so this run uses ${path.replace('_', ' ')} instead. Raise refine.cap_micro in the route table to allow it.`;
    }
    // Expected spend, shown before the rounds start (Justin's rule: estimates with a certainty).
    const perRound = estimate(path) * params.variants;
    const spentPlan = entries.reduce((sum, entry) => sum + entry.price_micro, 0);
    const typical = params.typical_rounds ?? 3;
    const clampCap = (value: number) => Math.min(params.cap_micro, Math.round(value));
    const measured = params.measured?.[path] === true;
    const costEstimate = {
      micro: clampCap(spentPlan + perRound * typical),
      low_micro: clampCap(spentPlan + perRound),
      high_micro: clampCap(spentPlan + perRound * params.max_rounds),
      certainty: path === 'library' ? 'sure' : measured ? 'fairly sure' : 'rough guess',
    };
    return c.json({ target, material, path, source, confidence, probabilities, params, entries, note, estimate: costEstimate });
  });

  app.post('/skin/variants', async (c) => {
    const bindings = options.bindings(c.env);
    const parsed = variantsBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body', issues: parsed.error.issues.slice(0, 3) }, 400);
    const body = parsed.data;
    const entries: EntryDraft[] = [];
    const exclude = new Set(body.exclude);

    if (body.path === 'library') {
      const ranked = rankLibrary(body.material).filter((entry) => !exclude.has(`lib-${entry.material.id}`));
      const variants: VariantOut[] = ranked.slice(0, body.n).map(({ material }) => ({
        id: `lib-${material.id}`,
        name: material.name,
        path: 'library',
        tokens: ensureReadable({ ...material.tokens }),
        background: material.background,
        veil: material.veil,
        description: `${material.name}: ${material.keywords.slice(0, 4).join(', ')} (library, MIT).`,
        image: null,
      }));
      return c.json({ variants, entries });
    }

    if (body.path === 'image_search') {
      const url =
        body.parent?.openverse_id && body.round > 1
          ? `${OPENVERSE_URL}${encodeURIComponent(body.parent.openverse_id)}/related/`
          : `${OPENVERSE_URL}?${new URLSearchParams({ q: body.material, license: 'cc0,pdm,by,by-sa', page_size: '20', mature: 'false' }).toString()}`;
      let results: OpenverseImage[] = [];
      let error: string | undefined;
      const search = async (target: string) => {
        try {
          const response = await fetchImpl(target, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
          entries.push(makeEntry(body.boxId, 'skin.search', 'openverse', 0, target.slice(0, 200), now()));
          if (!response.ok) {
            error = `Openverse ${response.status}`;
            return [];
          }
          return ((await response.json()) as { results?: OpenverseImage[] }).results ?? [];
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught);
          return [];
        }
      };
      results = await search(url);
      // "Related" can 404 or run dry; fall back to the next page of the plain search.
      const usable = results.filter((image) => ALLOWED_LICENSES.has((image.license ?? '').toLowerCase()) && !exclude.has(image.id));
      if (usable.length < body.n && url.includes('/related/')) {
        results = [...results, ...(await search(`${OPENVERSE_URL}?${new URLSearchParams({ q: body.material, license: 'cc0,pdm,by,by-sa', page_size: '20', page: String(Math.min(body.round, 10)), mature: 'false' }).toString()}`))];
        error = undefined;
      }
      const variants = results
        .map((image, index) => openverseToVariant(image, body.round, index))
        .filter((variant): variant is VariantOut => variant !== null && !exclude.has(variant.openverse_id ?? '') && !exclude.has(variant.id))
        .slice(0, body.n);
      return c.json({ variants, entries, ...(error ? { error } : {}) });
    }

    if (!bindings.OPENROUTER_API_KEY) return c.json({ error: 'OPENROUTER_API_KEY is not set on the router' }, 503);
    const apiKey = bindings.OPENROUTER_API_KEY;
    const table = loadRules();

    if (body.path === 'image_generate') {
      const model = table.tiers.image?.model ?? 'openai/gpt-5-image-mini';
      const hints = ['', 'Variation: stronger contrast between light and dark areas.', 'Variation: finer, smaller detail.'];
      const base = body.parent
        ? `Improve this background image so it looks more like "${body.material}". Keep it seamless and calm so text stays readable over it. ${body.parent.note ? `Judge's view of the current version: ${body.parent.note}.` : ''}`
        : `A seamless, calm background texture of ${body.material}, for the ${SKIN_TARGET_LABELS[body.target]} of an app. No text, no letters, no logos, no people, no frame. Even lighting and low detail in the middle so text stays readable over it. Landscape.`;
      const calls = await Promise.all(
        Array.from({ length: body.n }, (_unused, index) => {
          const content: Array<Record<string, unknown>> = [{ type: 'text', text: `${base} ${hints[index] ?? ''}`.trim() }];
          if (body.parent?.image_data) content.push({ type: 'image_url', image_url: { url: body.parent.image_data } });
          return chatOnce(fetchImpl, apiKey, { model, modalities: ['image', 'text'], messages: [{ role: 'user', content }] });
        }),
      );
      const variants: VariantOut[] = [];
      let error: string | undefined;
      calls.forEach((call, index) => {
        entries.push(makeEntry(body.boxId, 'skin.image', call.model, costOf(call), call.id, now()));
        if (!call.ok) {
          error = call.error;
          return;
        }
        const data = call.images[0];
        if (!data) {
          error = 'the image model returned no image';
          return;
        }
        variants.push({
          id: `gen-${body.round}-${index}-${Math.abs(hashCode(call.id || data.slice(-40))).toString(36)}`,
          name: `${body.material} (generated ${body.round}.${index + 1})`.slice(0, 60),
          path: 'image_generate',
          tokens: {},
          background: null,
          veil: 72,
          description: `Generated image of ${body.material}.`,
          image: {
            title: body.material.slice(0, 200),
            creator: call.model,
            license: `Generated with ${call.model}`,
            license_url: '',
            source_url: '',
            provider: 'openrouter',
          },
          image_data: data,
        });
      });
      return c.json({ variants, entries, ...(error ? { error } : {}) });
    }

    // css_tokens / procedural_code: one call writes n variants as JSON.
    const model = table.tiers.fast?.model ?? 'anthropic/claude-haiku-4.5';
    const recolourOnly = body.path === 'css_tokens';
    const system = [
      'You design skins for a web app as CSS. Reply with JSON only, no prose, in this shape:',
      '{"variants":[{"name":"short name","description":"one sentence on the look","tokens":{"--bg":"#hex","--surface":"#hex","--fg":"#hex","--accent":"#hex","--border":"#hex"},"background":"CSS background-image value or null","veil":30}]}',
      'Rules: tokens are #rrggbb colours; --fg on --bg must have contrast of at least 4.5:1.',
      recolourOnly
        ? 'This is a recolour only: set background to null.'
        : 'background uses only linear-gradient, radial-gradient, conic-gradient and their repeating- forms, with #hex, rgb(), rgba(), hsl(), hsla() colours, px, %, deg. No url(), no var(), no images, under 1500 characters. Layer several gradients for texture (grain, fibres, veins, brushing) that reads as the material.',
      'veil is 0 to 60: how much of the plain --bg covers the background so text stays readable; busy materials need more.',
      `Return exactly ${body.n} variants that differ from each other.`,
    ].join('\n');
    const user = body.parent
      ? `Material: ${body.material}. Part: ${SKIN_TARGET_LABELS[body.target]}. Make ${body.n} improved versions of this one, closer to the material and richer, still readable:\n${JSON.stringify({ name: body.parent.name, description: body.parent.description, tokens: body.parent.tokens, background: body.parent.background })}${body.parent.note ? `\nJudge's view: ${body.parent.note}` : ''}`
      : `Material: ${body.material}. Part: ${SKIN_TARGET_LABELS[body.target]}. Make ${body.n} versions.`;
    const call = await chatOnce(fetchImpl, apiKey, {
      model,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    entries.push(makeEntry(body.boxId, 'skin.code', call.model, costOf(call), call.id, now()));
    if (!call.ok) return c.json({ variants: [], entries, error: call.error });
    const json = extractJson(call.text) as { variants?: unknown[] } | null;
    const variants = (json?.variants ?? [])
      .map((raw, index) => cleanCssVariant(raw, `css-${body.round}-${index}-${Math.abs(hashCode(call.id + index)).toString(36)}`, body.path))
      .filter((variant): variant is VariantOut => variant !== null)
      .slice(0, body.n);
    return c.json({ variants, entries, ...(variants.length === 0 ? { error: 'no valid CSS variants in the reply' } : {}) });
  });

  app.post('/skin/score', async (c) => {
    const bindings = options.bindings(c.env);
    const parsed = scoreBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid body' }, 400);
    if (!bindings.OPENROUTER_API_KEY) return c.json({ error: 'OPENROUTER_API_KEY is not set on the router' }, 503);
    const apiKey = bindings.OPENROUTER_API_KEY;
    const body = parsed.data;
    const entries: EntryDraft[] = [];
    const table = loadRules();
    const descriptions = body.variants.map((variant) => variant.description);
    const palettes: Array<Record<string, string> | null> = body.variants.map(() => null);

    // 1. Vision: describe every image variant in one call (JSON out).
    const withImages = body.variants.map((variant, index) => ({ variant, index })).filter((entry) => entry.variant.image);
    if (withImages.length > 0) {
      const model = table.tiers.vision?.model ?? 'google/gemini-2.5-flash-lite';
      const content: Array<Record<string, unknown>> = [
        {
          type: 'text',
          text: `These ${withImages.length} images are candidate backgrounds for the ${SKIN_TARGET_LABELS[body.target]} of an app, meant to look like "${body.material}". For each, in order, describe what it shows in one plain sentence (material, colours, texture, anything odd like text or people) and give a UI palette taken from it as #rrggbb: bg (dark enough for light text), surface, fg (readable on bg), accent.`,
        },
        ...withImages.map((entry) => ({ type: 'image_url', image_url: { url: entry.variant.image } })),
      ];
      const call = await chatOnce(fetchImpl, apiKey, {
        model,
        max_tokens: 900,
        messages: [{ role: 'user', content }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'describe',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['items'],
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['index', 'description', 'bg', 'surface', 'fg', 'accent'],
                    properties: {
                      index: { type: 'integer' },
                      description: { type: 'string' },
                      bg: { type: 'string' },
                      surface: { type: 'string' },
                      fg: { type: 'string' },
                      accent: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      });
      entries.push(makeEntry(body.boxId, 'skin.vision', call.model, costOf(call), call.id, now(), withImages.length));
      const json = call.ok ? (extractJson(call.text) as { items?: Array<Record<string, unknown>> } | null) : null;
      (json?.items ?? []).forEach((item, position) => {
        const at = typeof item.index === 'number' && item.index >= 1 && item.index <= withImages.length ? item.index - 1 : position;
        const target = withImages[at];
        if (!target) return;
        if (typeof item.description === 'string') descriptions[target.index] = item.description.slice(0, 600);
        const palette: Record<string, string> = {};
        for (const key of ['bg', 'surface', 'fg', 'accent'] as const) {
          const value = item[key];
          if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())) palette[`--${key}`] = value.trim();
        }
        if (Object.keys(palette).length > 0) palettes[target.index] = ensureReadable(palette);
      });
    }

    // 2. Jev: one Score question per variant.
    const questions: Record<string, Question> = {};
    const state: Record<string, unknown> = { requested_material: body.material, part: SKIN_TARGET_LABELS[body.target] };
    body.variants.forEach((_variant, index) => {
      state[`variant_${index + 1}`] = descriptions[index] || 'no description';
      questions[`v${index}`] = {
        type: 'score',
        instructions: `How well does variant_${index + 1} match the requested material as a background for this part of an app, with text on top?`,
        criteria: SCORE_RUNGS,
      };
    });
    let scored: Array<number | null> = body.variants.map(() => null);
    if (bindings.ROUTER_USE_JEV !== 'false') {
      const decision = await decide({
        apiKey,
        state,
        questions,
        ...(bindings.OPENROUTER_JEV_MODEL ? { model: bindings.OPENROUTER_JEV_MODEL } : {}),
        fetchImpl,
        timeoutMs: 8000,
      });
      if (decision) {
        const cost = typeof decision.usage.cost === 'number' ? Math.round(decision.usage.cost * 1_000_000) : 0;
        entries.push(makeEntry(body.boxId, 'skin.score', decision.model, cost, decision.id, now(), body.variants.length));
        scored = body.variants.map((_variant, index) => expectedScore(decision.answers[`v${index}`]));
      }
    }
    return c.json({
      scores: body.variants.map((variant, index) => ({
        id: variant.id,
        score: scored[index] ?? null,
        note: descriptions[index] ?? '',
        palette: palettes[index],
      })),
      entries,
    });
  });
}

function hashCode(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (Math.imul(31, hash) + text.charCodeAt(index)) | 0;
  return hash;
}

export { SKIN_LIBRARY, type SkinTarget };
