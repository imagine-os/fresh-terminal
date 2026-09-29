import type { Usage } from './pricing';

/**
 * Verified 2026-09-28 against openrouter.ai/docs/api-reference/chat-completion:
 *   POST https://openrouter.ai/api/v1/chat/completions
 *   Authorization: Bearer <key>
 *   model ids look like provider/model-name
 *   "stream": true -> SSE with "data: {json}" lines and a final "data: [DONE]"
 *   "usage": { "include": true } asks for token usage (and cost) in the final chunk.
 */
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamEvent {
  type: 'delta' | 'usage' | 'id' | 'model' | 'error';
  text?: string;
  usage?: Usage;
  id?: string;
  /** The model OpenRouter actually served (matters for openrouter/auto). */
  model?: string;
  message?: string;
}

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  referer?: string;
  title?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function parseSseLine(line: string): unknown | null {
  if (!line.startsWith('data:')) {
    return null;
  }
  const payload = line.slice(5).trim();
  if (payload === '' || payload === '[DONE]') {
    return null;
  }
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

interface ChunkShape {
  id?: string;
  model?: string;
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: Usage;
  error?: { message?: string };
}

/**
 * Streams an OpenRouter chat completion as a sequence of typed events.
 */
export async function* streamChat(options: OpenRouterOptions): AsyncGenerator<StreamEvent> {
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

  const requestInit: RequestInit = {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: true,
      usage: { include: true },
    }),
  };
  if (options.signal) {
    requestInit.signal = options.signal;
  }
  const response = await fetchImpl(OPENROUTER_URL, requestInit);

  if (!response.ok || response.body === null) {
    const body = await response.text().catch(() => '');
    yield { type: 'error', message: `OpenRouter ${response.status}: ${body.slice(0, 300)}` };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sentId = false;
  let sentModel = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      const chunk = parseSseLine(line) as ChunkShape | null;
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
      const content = chunk.choices?.[0]?.delta?.content;
      if (typeof content === 'string' && content.length > 0) {
        yield { type: 'delta', text: content };
      }
      if (chunk.usage) {
        yield { type: 'usage', usage: chunk.usage };
      }
    }
  }
}
