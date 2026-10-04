import { applyOps, summarize, type Change } from '../ops/engine';
import type { Op } from '../ops/schema';
import { ALL_TOOLS, parseToolCall, RESPOND_TOOL } from '../ops/tools';
import { textToBlocks, type ReplyBlock } from '../reply/blocks';
import { streamChat, type ChatMessage, type ToolCall, type Usage } from './openrouter';
import { engineContext, toUiState, type Snapshot } from './snapshot';

export interface TurnOptions {
  apiKey: string;
  model: string;
  /** Used for the retry round, and from the start when startEscalated. */
  escalateModel?: string;
  startEscalated?: boolean;
  messages: ChatMessage[];
  snapshot: Snapshot;
  now?: () => number;
  fetchImpl?: typeof fetch;
  referer?: string;
  title?: string;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface RoundInfo {
  round: number;
  model: string;
  servedModel: string;
  toolCalls: number;
  rejected: string[];
  usage: Usage | null;
  generationId: string;
}

export interface TurnResult {
  ok: boolean;
  text: string;
  blocks: ReplyBlock[];
  ops: Op[];
  changes: Change[];
  rejected: string[];
  rounds: RoundInfo[];
  error: string | null;
}

interface CollectedCall {
  id: string;
  name: string;
  args: string;
}

async function runRound(options: TurnOptions, model: string, messages: ChatMessage[]) {
  const calls = new Map<number, CollectedCall>();
  let text = '';
  let usage: Usage | null = null;
  let servedModel = '';
  let generationId = '';
  let error: string | null = null;

  // "required" makes the model call tools. Some providers refuse it for some
  // models (Bedrock: 'tool_choice: type "tool" and "any" are not supported');
  // then the same request goes again with "auto" and the prompt does the work.
  for (const toolChoice of ['required', 'auto'] as const) {
    options.signal?.throwIfAborted();
    const streamOptions: Parameters<typeof streamChat>[0] = {
      apiKey: options.apiKey,
      model,
      messages,
      tools: ALL_TOOLS,
      toolChoice,
    };
    if (options.fetchImpl) streamOptions.fetchImpl = options.fetchImpl;
    if (options.signal) streamOptions.signal = options.signal;
    if (options.referer) streamOptions.referer = options.referer;
    if (options.title) streamOptions.title = options.title;
    error = null;

    for await (const event of streamChat(streamOptions)) {
      if (event.type === 'delta' && event.text) {
        text += event.text;
        options.onDelta?.(event.text);
      } else if (event.type === 'tool_call' && event.index !== undefined) {
        const call = calls.get(event.index) ?? { id: '', name: '', args: '' };
        if (event.id) call.id = event.id;
        if (event.name) call.name += event.name;
        if (event.argumentsDelta) call.args += event.argumentsDelta;
        calls.set(event.index, call);
      } else if (event.type === 'usage' && event.usage) {
        usage = event.usage;
      } else if (event.type === 'model' && event.model) {
        servedModel = event.model;
      } else if (event.type === 'id' && event.id) {
        generationId = event.id;
      } else if (event.type === 'error') {
        error = event.message ?? 'model error';
      }
    }
    options.signal?.throwIfAborted();
    const refusedChoice = error !== null && /tool_choice/i.test(error) && calls.size === 0 && text === '';
    if (!refusedChoice) break;
  }
  const ordered = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([index, call]) => ({ ...call, id: call.id || `call_${index}` }));
  return { calls: ordered, text, usage, servedModel: servedModel || model, generationId, error };
}

/** Parses and dry-runs one round's calls against the snapshot. */
function validate(calls: CollectedCall[], snapshot: Snapshot, now: number) {
  const ops: Op[] = [];
  const opCallIds: string[] = [];
  const results = new Map<string, string>();
  let blocks: ReplyBlock[] | null = null;
  const rejected: string[] = [];

  for (const call of calls) {
    const parsed = parseToolCall(call.name, call.args);
    if (!parsed.ok) {
      rejected.push(parsed.reason);
      results.set(call.id, `rejected: ${parsed.reason}`);
      continue;
    }
    if (parsed.kind === 'respond') {
      blocks = parsed.blocks;
      results.set(call.id, 'ok');
      continue;
    }
    ops.push(parsed.op);
    opCallIds.push(call.id);
    results.set(call.id, 'ok');
  }

  let changes: Change[] = [];
  if (ops.length > 0 && rejected.length === 0) {
    let counter = 0;
    const dry = applyOps(toUiState(snapshot), ops, engineContext(snapshot, now, (prefix) => `${prefix}-dry-${(counter += 1)}`));
    if (dry.ok) {
      changes = dry.changes;
    } else {
      const callId = opCallIds[dry.index] ?? '';
      const reason = `${calls.find((call) => call.id === callId)?.name ?? dry.op.op}: ${dry.reason}`;
      rejected.push(reason);
      results.set(callId, `rejected: ${dry.reason}`);
    }
  }
  return { ops, blocks, rejected, changes, results };
}

/**
 * One user turn: the model edits the interface through tools and replies
 * through `respond`. Invalid or inapplicable ops get one retry, with the
 * reasons, on the escalation model. Nothing is ever partly applied.
 */
export async function runTurn(options: TurnOptions): Promise<TurnResult> {
  const now = (options.now ?? Date.now)();
  const rounds: RoundInfo[] = [];
  let messages = options.messages;
  let text = '';
  const firstModel = options.startEscalated && options.escalateModel ? options.escalateModel : options.model;

  for (let round = 1; round <= 2; round += 1) {
    const model = round === 1 ? firstModel : options.escalateModel ?? options.model;
    options.signal?.throwIfAborted();
    const result = await runRound(options, model, messages);
    options.signal?.throwIfAborted();
    text += result.text;
    if (result.error && result.calls.length === 0) {
      rounds.push({ round, model, servedModel: result.servedModel, toolCalls: 0, rejected: [], usage: result.usage, generationId: result.generationId });
      const earlier = rounds[rounds.length - 2];
      if (earlier && earlier.rejected.length > 0) {
        // The retry itself failed: report what was wrong with the first try, not a provider dump.
        return {
          ok: false,
          text,
          blocks: [
            { kind: 'summary', text: 'I could not make that change.' },
            { kind: 'error', text: earlier.rejected.join('; ').slice(0, 600) },
            { kind: 'note', text: `The retry on ${model} failed: ${result.error.slice(0, 200)}` },
          ],
          ops: [],
          changes: [],
          rejected: earlier.rejected,
          rounds,
          error: null,
        };
      }
      return { ok: false, text, blocks: textToBlocks(text), ops: [], changes: [], rejected: [], rounds, error: result.error };
    }
    const checked = validate(result.calls, options.snapshot, now);
    rounds.push({
      round,
      model,
      servedModel: result.servedModel,
      toolCalls: result.calls.length,
      rejected: checked.rejected,
      usage: result.usage,
      generationId: result.generationId,
    });

    if (checked.rejected.length === 0) {
      let blocks = checked.blocks ?? textToBlocks(result.text || text);
      if (blocks.length === 0) {
        blocks = [{ kind: 'summary', text: checked.changes.length > 0 ? summarize(checked.changes) : 'Done.' }];
      }
      return { ok: true, text, blocks, ops: checked.ops, changes: checked.changes, rejected: [], rounds, error: null };
    }

    if (round === 2) {
      return {
        ok: false,
        text,
        blocks: [
          { kind: 'summary', text: 'I could not make that change.' },
          { kind: 'error', text: checked.rejected.join('; ').slice(0, 600) },
        ],
        ops: [],
        changes: [],
        rejected: checked.rejected,
        rounds,
        error: null,
      };
    }

    // Retry: tell the model exactly what failed; nothing was applied.
    const toolCalls: ToolCall[] = result.calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.args || '{}' } }));
    messages = [
      ...messages,
      { role: 'assistant', content: result.text || null, tool_calls: toolCalls },
      ...result.calls.map((call): ChatMessage => ({
        role: 'tool',
        tool_call_id: call.id,
        content: checked.results.get(call.id) === 'ok' && call.name !== RESPOND_TOOL ? 'not applied: the batch was rejected' : checked.results.get(call.id) ?? 'not applied',
      })),
      {
        role: 'user',
        content: `Nothing was applied. Problems: ${checked.rejected.join('; ')}. Resend the complete corrected set of tool calls, then respond.`,
      },
    ];
  }
  return { ok: false, text, blocks: textToBlocks(text), ops: [], changes: [], rejected: [], rounds, error: 'no result' };
}

/** Total provider cost of a turn in integer micro-dollars. */
export function turnCostMicro(rounds: RoundInfo[]): number {
  let total = 0;
  for (const round of rounds) {
    const cost = round.usage?.cost;
    if (typeof cost === 'number' && Number.isFinite(cost)) {
      total += Math.round(cost * 1_000_000);
    }
  }
  return total;
}
