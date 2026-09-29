import { readJson, writeJson } from '../lib/storage';

/**
 * The visitor's own OpenRouter key. Stored only in this browser's localStorage
 * and read only by openrouterDirect.ts. Never sent to our router, never put in
 * prefs, never logged.
 */
const KEY = 'fresh-terminal.own-openrouter-key';

export function readOwnKey(): string {
  return readJson<string>(KEY, '');
}

export function writeOwnKey(value: string): void {
  writeJson(KEY, value.trim());
}

export function deleteOwnKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}

export function maskKey(value: string): string {
  if (value.length <= 8) {
    return '•'.repeat(value.length);
  }
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
