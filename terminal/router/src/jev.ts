import type { RouteTable } from '../../shared/src/routing';

/**
 * Jev (TypeSafe) through OpenRouter's Decisions API. Verified 2026-09-28:
 *   POST https://openrouter.ai/api/alpha/decisions
 *   Authorization: Bearer <key>
 *   body: { model: "typesafe/jev-1.13", state, questions: { name: {type, instructions, criteria} } }
 *   answer types: noul (probability true), choice (choice, confidence, probabilities), score
 *   pricing: $0.042 per million input tokens, output free; modality text -> decisions.
 * Jev returns typed decisions only. Never prose. So it routes, checks and scores;
 * it does not answer the user.
 */
export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.13';

export type Question =
  | { type: 'noul'; instructions: string; criteria: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> };

export interface DecisionUsage {
  input_tokens: number;
  output_tokens: number;
  cost?: number;
}

export interface Decision {
  id: string;
  model: string;
  answers: Record<string, Answer>;
  usage: DecisionUsage;
}

export interface DecideOptions {
  apiKey: string;
  state: string | Record<string, unknown>;
  questions: Record<string, Question>;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Asks Jev. Returns null on any failure (no key, network, non-2xx, bad shape)
 * so callers fall back to rules. Never throws.
 */
export async function decide(options: DecideOptions): Promise<Decision | null> {
  if (!options.apiKey) {
    return null;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000);
  try {
    const response = await fetchImpl(DECISIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model ?? JEV_MODEL,
        state: options.state,
        questions: options.questions,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as Partial<Decision>;
    if (!body || typeof body !== 'object' || !body.answers || typeof body.answers !== 'object') {
      return null;
    }
    return {
      id: body.id ?? '',
      model: body.model ?? options.model ?? JEV_MODEL,
      answers: body.answers,
      usage: body.usage ?? { input_tokens: 0, output_tokens: 0 },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface RoutingDecision {
  intent: string;
  source: 'jev' | 'rules';
  confidence: number | null;
  model: string | null;
  costMicro: number;
  generationId: string | null;
}

const INTENT_DESCRIPTIONS: Record<string, string> = {
  chat: 'General conversation, a question, or anything that is not one of the other verbs.',
  edit_ui:
    "Change this app's own interface: add, nest, rename, move or remove sidebar menu items; change the layout, theme, colours or style; create or edit pages; add starters, canvas cards or glossary terms.",
  make: 'Create or make something new: a page, a box, a document, a plan.',
  build: 'Build or assemble something with several parts, code, or a system.',
  show: 'Display or reveal information that already exists.',
  list: 'Enumerate items: boxes, files, tasks, options.',
  add: 'Add an item to something that exists.',
  remove: 'Remove or delete an item.',
  open: 'Open or navigate to something.',
  send: 'Send a message, email, or item to someone.',
  schedule: 'Schedule, plan a time, set a reminder or a date.',
  find: 'Search for or locate something.',
  tag: 'Tag, label, or classify the text itself.',
};

/** Builds the Choice question over the route table's intents. */
export function intentQuestion(table: RouteTable): Question {
  const criteria: Record<string, string> = {};
  for (const rule of table.rules) {
    criteria[rule.intent] = INTENT_DESCRIPTIONS[rule.intent] ?? `The user wants to ${rule.intent}.`;
  }
  return { type: 'choice', instructions: 'Which intent does the user\'s text express?', criteria };
}

/**
 * Intent routing: ask Jev for a Choice over the table; fall back to the
 * rules-only detector when Jev is unavailable or unsure.
 */
export async function routeIntent(
  text: string,
  table: RouteTable,
  options: { apiKey?: string; model?: string; fetchImpl?: typeof fetch; enabled?: boolean; fallback: (text: string) => string; minConfidence?: number },
): Promise<RoutingDecision> {
  const fallback = (): RoutingDecision => ({
    intent: options.fallback(text),
    source: 'rules',
    confidence: null,
    model: null,
    costMicro: 0,
    generationId: null,
  });
  if (options.enabled === false || !options.apiKey) {
    return fallback();
  }
  const decideOptions: DecideOptions = {
    apiKey: options.apiKey,
    state: text,
    questions: { intent: intentQuestion(table) },
  };
  if (options.model) {
    decideOptions.model = options.model;
  }
  if (options.fetchImpl) {
    decideOptions.fetchImpl = options.fetchImpl;
  }
  const decision = await decide(decideOptions);
  const answer = decision?.answers.intent;
  if (!decision || !answer || answer.type !== 'choice' || !table.rules.some((rule) => rule.intent === answer.choice)) {
    return fallback();
  }
  if (answer.confidence < (options.minConfidence ?? 0.35)) {
    return { ...fallback(), model: decision.model, costMicro: costMicroOf(decision.usage), generationId: decision.id };
  }
  return {
    intent: answer.choice,
    source: 'jev',
    confidence: answer.confidence,
    model: decision.model,
    costMicro: costMicroOf(decision.usage),
    generationId: decision.id,
  };
}

/** Yes/no permission check: does this text ask for something only the box owner may do? */
export async function needsOwner(
  text: string,
  options: { apiKey?: string; model?: string; fetchImpl?: typeof fetch },
): Promise<{ needsOwner: boolean; probability: number | null; costMicro: number }> {
  if (!options.apiKey) {
    return { needsOwner: false, probability: null, costMicro: 0 };
  }
  const decideOptions: DecideOptions = {
    apiKey: options.apiKey,
    state: text,
    questions: {
      owner: {
        type: 'noul',
        instructions: 'Does carrying out this request change or remove something, send something to others, or spend money?',
        criteria: {
          true: 'It deletes, sends, schedules on behalf of, pays, or changes settings for the box.',
          false: 'It only reads, shows, lists, finds, or makes something new inside the box.',
        },
      },
    },
  };
  if (options.model) {
    decideOptions.model = options.model;
  }
  if (options.fetchImpl) {
    decideOptions.fetchImpl = options.fetchImpl;
  }
  const decision = await decide(decideOptions);
  const answer = decision?.answers.owner;
  if (!decision || !answer || answer.type !== 'noul') {
    return { needsOwner: false, probability: null, costMicro: 0 };
  }
  return { needsOwner: answer.noul >= 0.5, probability: answer.noul, costMicro: costMicroOf(decision.usage) };
}

export interface AmbiguousSpan {
  key: string;
  text: string;
  start: number;
  end: number;
  kinds: string[];
}

/**
 * Resolves ambiguous chips with one Decisions call: a Choice per span over its
 * plausible kinds, with the whole text as state so context decides ("Hoy's new
 * logo" vs "hoy a las 3").
 */
export async function disambiguateChips(
  text: string,
  spans: AmbiguousSpan[],
  describe: (kind: string) => string,
  options: { apiKey?: string; model?: string; fetchImpl?: typeof fetch },
): Promise<{ answers: Record<string, { kind: string; confidence: number; probabilities: Record<string, number> }>; costMicro: number } | null> {
  if (!options.apiKey || spans.length === 0) {
    return null;
  }
  const questions: Record<string, Question> = {};
  for (const span of spans.slice(0, 8)) {
    const criteria: Record<string, string> = {};
    for (const kind of span.kinds) {
      criteria[kind] = describe(kind);
    }
    questions[span.key] = {
      type: 'choice',
      instructions: `In this text, what is "${text.slice(span.start, span.end)}" (characters ${span.start} to ${span.end})?`,
      criteria,
    };
  }
  const decideOptions: DecideOptions = { apiKey: options.apiKey, state: text, questions };
  if (options.model) decideOptions.model = options.model;
  if (options.fetchImpl) decideOptions.fetchImpl = options.fetchImpl;
  const decision = await decide(decideOptions);
  if (!decision) {
    return null;
  }
  const answers: Record<string, { kind: string; confidence: number; probabilities: Record<string, number> }> = {};
  for (const [key, answer] of Object.entries(decision.answers)) {
    if (answer.type === 'choice') {
      answers[key] = { kind: answer.choice, confidence: answer.confidence, probabilities: answer.probabilities };
    }
  }
  return { answers, costMicro: costMicroOf(decision.usage) };
}

function costMicroOf(usage: DecisionUsage): number {
  return typeof usage.cost === 'number' && Number.isFinite(usage.cost) ? Math.round(usage.cost * 1_000_000) : 0;
}
