/** The OpenRouter client lives in shared so the browser own-key path uses the same code. */
export { OPENROUTER_URL, streamChat } from '../../shared/src/agent/openrouter';
export type { ChatMessage, StreamEvent, ToolCall, Usage } from '../../shared/src/agent/openrouter';
