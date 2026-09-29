import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RouterBindings } from './app';

/** Tiny .env loader so the router has no dotenv dependency. */
export function loadDotEnv(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const equals = line.indexOf('=');
    if (equals === -1) {
      continue;
    }
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function bindingsFromProcessEnv(): RouterBindings {
  const bindings: RouterBindings = {};
  const keys: Array<keyof RouterBindings> = [
    'OPENROUTER_API_KEY',
    'OPENROUTER_DEFAULT_MODEL',
    'OPENROUTER_JEV_MODEL',
    'ROUTER_ALLOWED_ORIGIN',
    'ALLOWED_ORIGINS',
    'ROUTER_REFERER',
    'ROUTER_USE_JEV',
    'OPENROUTER_TAGGER_MODEL',
    'OPENAI_API_KEY',
    'OPENAI_REALTIME_MODEL',
    'OPENAI_TRANSCRIBE_MODEL',
    'GOOGLE_API_KEY',
    'GEMINI_LIVE_MODEL',
  ];
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      bindings[key] = value;
    }
  }
  return bindings;
}

export function routerDir(): string {
  return resolve(new URL('..', import.meta.url).pathname);
}
