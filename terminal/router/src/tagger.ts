import { z } from 'zod';
import { CHIP_KINDS, type Chip } from '../../shared/src/chips/types';

/**
 * Model tagger tier: chips as JSON from a small, cheap model with a strict
 * JSON schema (google/gemini-2.5-flash-lite by default; openai/gpt-4.1-nano as
 * the alternate). Every field is required so strict mode is accepted; "" and
 * [] mean "none". Offsets are checked against the text before anything is
 * returned. The router asks Jev to settle chips that stay ambiguous.
 */
export const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const readingSchema = z.object({ kind: z.enum(CHIP_KINDS), value: z.string(), p: z.number().min(0).max(1) });
const chipSchema = z.object({
  kind: z.enum(CHIP_KINDS),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  text: z.string(),
  value: z.string(),
  p: z.number().min(0).max(1),
  alternatives: z.array(readingSchema).max(3),
});
const chipsBodySchema = z.object({ chips: z.array(chipSchema) });

const readingJson = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'value', 'p'],
  properties: { kind: { type: 'string', enum: [...CHIP_KINDS] }, value: { type: 'string' }, p: { type: 'number' } },
};

export const CHIPS_JSON_SCHEMA = {
  name: 'chips',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['chips'],
    properties: {
      chips: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'start', 'end', 'text', 'value', 'p', 'alternatives'],
          properties: {
            kind: { type: 'string', enum: [...CHIP_KINDS] },
            start: { type: 'integer' },
            end: { type: 'integer' },
            text: { type: 'string' },
            value: { type: 'string' },
            p: { type: 'number' },
            alternatives: { type: 'array', items: readingJson },
          },
        },
      },
    },
  },
} as const;

export interface GlossaryHint {
  text: string;
  type: string;
  note?: string;
}

function taggerPrompt(glossary: GlossaryHint[]): string {
  const taught = glossary.length
    ? `\nThis box has taught you these words (treat them exactly so): ${JSON.stringify(glossary)}`
    : '';
  return `You tag spans in the user's text. Kinds: action (leading verb), date (days, "today", "hoy" in Spanish when it means today), time (3pm, 15:00, "a las 3"), person, org (company or brand), place, object (a named thing, often quoted), variable ($name), list (list marker), number, money, url, page/nav/theme (names of this app's pages, menu items, themes), entity (proper noun of unknown kind).
Return only spans you can locate exactly: start/end are character offsets [start, end) into the text and text must equal the covered substring. p is your probability for kind. If a span could be another kind, list it in alternatives with its probability (e.g. "Hoy" can be org or date). Use context: "Hoy's new logo" is org; "hoy a las 3" is date. value is a normalised value or "". When unsure a span is anything, leave it out.${taught}`;
}

export interface TagOptions {
  apiKey: string;
  model: string;
  text: string;
  glossary?: GlossaryHint[];
  fetchImpl?: typeof fetch;
}

export interface TagResult {
  chips: Chip[];
  servedModel: string;
  costMicro: number;
  generationId: string;
}

/** Returns validated chips, or null when anything is off. Never throws. */
export async function tagWithModel(options: TagOptions): Promise<TagResult | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: taggerPrompt(options.glossary ?? []) },
          { role: 'user', content: options.text },
        ],
        response_format: { type: 'json_schema', json_schema: CHIPS_JSON_SCHEMA },
        usage: { include: true },
        temperature: 0,
      }),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      id?: string;
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { cost?: number };
    };
    const content = body.choices?.[0]?.message?.content ?? '';
    const parsed = chipsBodySchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return null;
    }
    const chips: Chip[] = [];
    for (const chip of parsed.data.chips) {
      if (chip.end <= chip.start || options.text.slice(chip.start, chip.end) !== chip.text) {
        continue;
      }
      const clean: Chip = { kind: chip.kind, start: chip.start, end: chip.end, text: chip.text, p: chip.p, source: 'model' };
      if (chip.value) clean.value = chip.value;
      const alternatives = chip.alternatives
        .filter((reading) => reading.kind !== chip.kind)
        .map((reading) => (reading.value ? { kind: reading.kind, value: reading.value, p: reading.p } : { kind: reading.kind, p: reading.p }));
      if (alternatives.length > 0) clean.alternatives = alternatives;
      chips.push(clean);
    }
    const cost = body.usage?.cost;
    return {
      chips,
      servedModel: body.model ?? options.model,
      costMicro: typeof cost === 'number' && Number.isFinite(cost) ? Math.round(cost * 1_000_000) : 0,
      generationId: body.id ?? '',
    };
  } catch {
    return null;
  }
}
