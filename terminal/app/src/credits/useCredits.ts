import { useEffect, useSyncExternalStore } from 'react';
import type { CreditsErrorCode, CreditsStatus } from '@shared/credits';
import { routerFetch, type SoftPromptEvent } from '../lib/routerFetch';

/**
 * Free credits as the router reports them (GET /credits), for the top-right
 * tray and anything else that wants to show them. The router enforces; this
 * only displays. `state: 'off'` means this router does not meter (local dev).
 */
export interface CreditsView {
  state: 'loading' | 'ok' | 'off' | 'error';
  status: CreditsStatus | null;
  /** The last soft "sign in to keep going" prompt this page saw. */
  lastSoftPrompt: (SoftPromptEvent & { at: number }) | null;
  /** The last credits error a paid call answered with. */
  lastError: { code: CreditsErrorCode; message: string; at: number } | null;
}

let view: CreditsView = { state: 'loading', status: null, lastSoftPrompt: null, lastError: null };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function set(patch: Partial<CreditsView>): void {
  view = { ...view, ...patch };
  for (const listener of listeners) listener();
}

export async function refreshCredits(): Promise<void> {
  try {
    const response = await routerFetch('/credits', { method: 'GET' });
    if (response.status === 503 || response.status === 404) {
      set({ state: 'off', status: null });
      return;
    }
    if (!response.ok) {
      set({ state: 'error' });
      return;
    }
    set({ state: 'ok', status: (await response.json()) as CreditsStatus });
  } catch {
    set({ state: 'error' });
  }
}

/** Paid calls report credit errors here (402/403/413/429 bodies). */
export function reportCreditsError(code: CreditsErrorCode, message: string): void {
  set({ lastError: { code, message, at: Date.now() } });
  void refreshCredits();
}

function start(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const soon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void refreshCredits(), 600);
  };
  window.addEventListener('ft:credits-changed', soon);
  window.addEventListener('ft:soft-prompt', (event) => {
    const detail = (event as CustomEvent<SoftPromptEvent>).detail;
    set({ lastSoftPrompt: { ...detail, at: Date.now() } });
    soon();
  });
  void refreshCredits();
}

export function creditsSnapshot(): CreditsView {
  return view;
}

export function subscribeCredits(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCredits(): CreditsView & { refresh: () => Promise<void> } {
  const current = useSyncExternalStore(subscribeCredits, creditsSnapshot, creditsSnapshot);
  useEffect(() => start(), []);
  return { ...current, refresh: refreshCredits };
}
