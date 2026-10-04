/**
 * OpenRouter chat completions over SSE, shared by the router (Node/Worker) and
 * the bring-your-own-key browser path. Verified: POST /api/v1/chat/completions,
 * Bearer auth, `stream: true` -> `data: {...}` lines ending in `data: [DONE]`,
 * `usage: {include: true}` for cost, and OpenAI-style streamed tool calls:
 * choices[0].delta.tool_calls[{index, id, function: {name, arguments}}] with
 * finish_reason "tool_calls".
 */
import type { ToolDef } from '../ops/tools';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** USD, float, when usage.include is set. */
  cost?: number;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface StreamEvent {
  type: 'delta' | 'usage' | 'id' | 'model' | 'tool_call' | 'finish' | 'error';
  text?: string;
  usage?: Usage;
  id?: string;
  model?: string;
  /** tool_call: fragment for the call at `index`. */
  index?: number;
  name?: string;
  argumentsDelta?: string;
  finishReason?: string;
  message?: string;
}

export interface StreamChatOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  toolChoice?: 'auto' | 'required' | 'none';
  referer?: string;
  title?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  maxTokens?: number;
}

interface ChunkShape {
  id?: string;
  model?: string;
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
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

export async function* streamChat(options: StreamChatOptions): AsyncGenerator<StreamEvent> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (options.referer) {
    headers['HTTP-Referer'] = options.referer;
  }
  if (options.title) {
    headers['X-Title'] = options.title;
  }
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: true,
    usage: { include: true },
  };
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? 'auto';
  }
  if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
  }
  const init: RequestInit = { method: 'POST', headers, body: JSON.stringify(body) };
  if (options.signal) {
    init.signal = options.signal;
  }

  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_URL, init);
  } catch (error) {
    yield { type: 'error', message: `Could not reach OpenRouter: ${error instanceof Error ? error.message : String(error)}` };
    return;
  }
  if (!response.ok || response.body === null) {
    const text = await response.text().catch(() => '');
    yield { type: 'error', message: `OpenRouter ${response.status}: ${readableError(text).slice(0, 300)}` };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sentId = false;
  let sentModel = false;
  const onAbort = () => { void reader.cancel().catch(() => undefined); };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      options.signal?.throwIfAborted();
      const { done, value } = await reader.read();
      options.signal?.throwIfAborted();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        options.signal?.throwIfAborted();
        const chunk = parseSseLine(buffer.slice(0, newline).trim());
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (chunk === null) {
          continue;
        }
        if (chunk.error?.message) {
          yield { type: 'error', message: chunk.error.message };
          continue;
        }
        if (!sentId && chunk.id) {
          sentId = true;
          yield { type: 'id', id: chunk.id };
        }
        if (!sentModel && chunk.model) {
          sentModel = true;
          yield { type: 'model', model: chunk.model };
        }
        const choice = chunk.choices?.[0];
        const content = choice?.delta?.content;
        if (typeof content === 'string' && content.length > 0) {
          yield { type: 'delta', text: content };
        }
        for (const call of choice?.delta?.tool_calls ?? []) {
          const event: StreamEvent = { type: 'tool_call', index: call.index ?? 0 };
          if (call.id) {
            event.id = call.id;
          }
          if (call.function?.name) {
            event.name = call.function.name;
          }
          if (call.function?.arguments) {
            event.argumentsDelta = call.function.arguments;
          }
          yield event;
        }
        if (choice?.finish_reason) {
          yield { type: 'finish', finishReason: choice.finish_reason };
        }
        if (chunk.usage) {
          yield { type: 'usage', usage: chunk.usage };
        }
      }
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Pulls the provider's own message out of an OpenRouter error body (raw JSON is hard to read). */
export function readableError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; metadata?: { raw?: string; provider_name?: string } } };
    const outer = parsed.error?.message ?? '';
    const raw = parsed.error?.metadata?.raw;
    let inner = '';
    if (raw) {
      try {
        inner = (JSON.parse(raw) as { message?: string; error?: { message?: string } }).message ?? '';
      } catch {
        inner = raw;
      }
    }
    const provider = parsed.error?.metadata?.provider_name;
    const text = [outer, inner].filter(Boolean).join(': ');
    return text ? (provider ? `${text} (${provider})` : text) : body;
  } catch {
    return body;
  }
}
