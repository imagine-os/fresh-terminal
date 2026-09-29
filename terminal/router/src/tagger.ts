import { z } from 'zod';
import { CHIP_KINDS, type Chip } from '../../shared/src/chips/types';

/**
 * Model tagger tier: chips as JSON from a small, cheap model with a JSON
 * schema response (google/gemini-2.5-flash-lite by default; openai/gpt-4.1-nano
 * as the alternate). Non-streaming; one call per keystroke pause when the dev
 * toggle is on. The local heuristic tagger stays the default.
 */
export const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const chipSchema = z.object({
  kind: z.enum(CHIP_KINDS),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  text: z.string(),
  value: z.string().optional(),
});

const chipsBodySchema = z.object({ chips: z.array(chipSchema) });

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
          required: ['kind', 'start', 'end', 'text'],
          properties: {
            kind: { type: 'string', enum: [...CHIP_KINDS] },
            start: { type: 'integer' },
            end: { type: 'integer' },
            text: { type: 'string' },
            value: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

const TAGGER_PROMPT = `You tag spans in the user's text. Kinds: date (dates and relative times), action (a leading verb like make, build, show, list, add, remove, open, send, schedule, find), list (a list marker), object (a quoted name), variable ($name), entity (a capitalised multi-word proper noun). Return only spans you are sure about, with exact character offsets [start, end) into the text and the exact covered text. When unsure, leave it out.`;

export interface TagOptions {
  apiKey: string;
  model: string;
  text: string;
  fetchImpl?: typeof fetch;
}

export interface TagResult {
  chips: Chip[];
  servedModel: string;
  costMicro: number;
  generationId: string;
}

/** Returns validated chips, or an empty list when anything is off. Never throws. */
export async function tagWithModel(options: TagOptions): Promise<TagResult | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: TAGGER_PROMPT },
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
      const clean: Chip = { kind: chip.kind, start: chip.start, end: chip.end, text: chip.text };
      if (chip.value !== undefined) {
        clean.value = chip.value;
      }
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
