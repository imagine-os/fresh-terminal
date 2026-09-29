import { useSyncExternalStore } from 'react';
import type { EntryDraft } from '@shared/ledger';
import { DEFAULT_REFINE, refine, type RefineParams, type Scored } from '@shared/refine';
import { draftSkin, ensureReadable, parseSkinRequest, type Skin, type SkinImage, type SkinPath, type SkinRun, type SkinTarget } from '@shared/skins';
import { compressDataUrl, putBlob } from '../lib/blobs';
import { newId } from '../lib/ids';
import { probeRouter } from '../lib/routerHealth';
import { store } from '../store';

/**
 * Runs one skin request end to end: an instant draft, Jev's path choice,
 * then refine() rounds of three variants scored by vision + Jev. Every call
 * is ledgered; the run is saved on its transcript line after every step.
 */

interface PlanResponse {
  target: SkinTarget;
  material: string;
  path: SkinPath;
  source: 'jev' | 'rules';
  params: RefineParams & { estimate_micro?: Record<string, number> };
  entries: EntryDraft[];
}

interface VariantResponse {
  variants: Array<{
    id: string;
    name: string;
    path: SkinPath;
    tokens: Record<string, string>;
    background: string | null;
    veil: number;
    description: string;
    image: (Omit<SkinImage, 'ref'> & { ref?: string }) | null;
    image_data?: string;
    openverse_id?: string;
  }>;
  entries: EntryDraft[];
  error?: string;
}

interface ScoreResponse {
  scores: Array<{ id: string; score: number | null; note: string; palette: Record<string, string> | null }>;
  entries: EntryDraft[];
}

const runs = new Map<string, SkinRun>();
const controllers = new Map<string, AbortController>();
const lines = new Map<string, string>();
const listeners = new Set<() => void>();
/** Per run, in memory only: JPEG data URLs of generated images (for scoring and upgrades) and Openverse ids. */
const imageData = new Map<string, string>();
const openverseIds = new Map<string, string>();

function emit(run: SkinRun): void {
  runs.set(run.id, run);
  const lineId = lines.get(run.id);
  if (lineId) {
    store.setLineReply(lineId, {
      meta: { intent: 'skin', model: run.path ?? '', ms: (run.finished_at ?? Date.now()) - run.started_at, cost_micro: run.spent_micro },
      blocks: [{ kind: 'refine', run }],
    });
  }
  for (const listener of listeners) listener();
}

export function getRun(id: string): SkinRun | undefined {
  return runs.get(id);
}

export function useLiveRun(id: string): SkinRun | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => runs.get(id),
    () => runs.get(id),
  );
}

export function isRunning(id: string): boolean {
  return controllers.has(id);
}

export function stopRun(id: string): void {
  controllers.get(id)?.abort();
}

function ledger(entries: EntryDraft[]): number {
  let total = 0;
  for (const entry of entries) {
    const { owner_identity: _owner, ...draft } = entry;
    store.appendEntry(draft);
    total += entry.price_micro;
  }
  return total;
}

async function post<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${new URL(url).pathname} HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ''}`);
  }
  return (await response.json()) as T;
}

/** Applies a skin (undoable) and marks it as this run's applied variant. */
export function applyRunSkin(runId: string, skin: Skin, source: 'local' | 'assistant' | 'chip' = 'chip'): boolean {
  const run = runs.get(runId);
  const boxId = run?.box_id ?? '';
  if (!boxId) return false;
  const result = store.applyOps(boxId, [{ op: 'skin.apply', skin }], source);
  if (result.ok && run) emit({ ...run, applied: skin.id });
  return result.ok;
}

/** Registers a run restored from a saved line so its thumbnails can still be applied. */
export function adoptRun(run: SkinRun): void {
  if (!runs.has(run.id)) runs.set(run.id, run);
}

export async function startSkinRun(options: { boxId: string; text: string; lineId: string }): Promise<SkinRun> {
  const { boxId, text, lineId } = options;
  const parsed = parseSkinRequest(text);
  const id = newId('run');
  const controller = new AbortController();
  controllers.set(id, controller);
  lines.set(id, lineId);
  let run: SkinRun = {
    id,
    box_id: boxId,
    request: text.slice(0, 600),
    material: parsed.material.slice(0, 300),
    target: parsed.target,
    path: null,
    path_source: null,
    status: 'planning',
    reason: null,
    error: null,
    spent_micro: 0,
    cap_micro: DEFAULT_REFINE.cap_micro,
    draft: null,
    rounds: [],
    applied: null,
    started_at: Date.now(),
    finished_at: null,
  };

  // 1. The temporary result, applied at once.
  const draft = draftSkin(parsed.material, parsed.target, newId('skin'), Date.now());
  store.applyOps(boxId, [{ op: 'skin.apply', skin: draft }], 'local');
  run = { ...run, draft, applied: draft.id };
  emit(run);

  const finish = (patch: Partial<SkinRun>) => {
    controllers.delete(id);
    run = { ...run, ...patch, status: 'done', finished_at: Date.now() };
    emit(run);
    return run;
  };

  const health = await probeRouter();
  if (health.state !== 'ok') {
    return finish({ reason: 'error', error: 'No router is reachable, so only the draft from the material library was applied.' });
  }
  const base = health.url;

  // 2. Jev picks the path.
  let plan: PlanResponse;
  try {
    plan = await post<PlanResponse>(`${base}/skin/plan`, { boxId, text }, controller.signal);
  } catch (error) {
    return finish({ reason: controller.signal.aborted ? 'stopped' : 'error', error: controller.signal.aborted ? null : String(error instanceof Error ? error.message : error) });
  }
  run = { ...run, path: plan.path, path_source: plan.source, spent_micro: run.spent_micro + ledger(plan.entries), cap_micro: plan.params.cap_micro, status: 'running' };
  emit(run);
  const params: RefineParams = {
    variants: plan.params.variants,
    target_score: plan.params.target_score,
    patience: plan.params.patience,
    max_rounds: plan.params.max_rounds,
    // The plan call already spent a little of the cap.
    cap_micro: Math.max(0, plan.params.cap_micro - run.spent_micro),
  };
  const estimate = plan.params.estimate_micro?.[plan.path] ?? 2500;
  const seen: string[] = [];
  let bestScore = -1;

  // 3. refine(): best of three, round after round.
  const result = await refine<Skin>(params, {
    signal: controller.signal,
    estimateMicro: () => estimate,
    generate: async ({ round, n, parent, signal }) => {
      const parentPayload = parent
        ? {
            name: parent.variant.name,
            description: parent.variant.description,
            tokens: parent.variant.tokens,
            background: parent.variant.background,
            note: parent.note.slice(0, 400),
            ...(imageData.get(parent.variant.id) ? { image_data: imageData.get(parent.variant.id) } : {}),
            ...(openverseIds.get(parent.variant.id) ? { openverse_id: openverseIds.get(parent.variant.id) } : {}),
          }
        : null;
      const response = await post<VariantResponse>(
        `${base}/skin/variants`,
        { boxId, path: plan.path, material: run.material, target: run.target, round, n, parent: parentPayload, exclude: seen.slice(-60) },
        signal,
      );
      const cost = ledger(response.entries);
      const skins: Skin[] = [];
      for (const variant of response.variants) {
        seen.push(variant.id);
        if (variant.openverse_id) {
          seen.push(variant.openverse_id);
          openverseIds.set(variant.id, variant.openverse_id);
        }
        let image: SkinImage | null = null;
        if (variant.image_data && variant.image) {
          try {
            const compressed = await compressDataUrl(variant.image_data);
            const key = newId('img').toLowerCase().replace(/[^a-z0-9-]/g, '');
            await putBlob(key, compressed.blob);
            imageData.set(variant.id, compressed.dataUrl);
            image = { ...variant.image, ref: `idb:${key}`, width: compressed.width, height: compressed.height };
          } catch {
            continue;
          }
        } else if (variant.image?.ref) {
          image = { ...variant.image, ref: variant.image.ref };
        }
        skins.push({
          id: variant.id,
          name: variant.name,
          target: run.target,
          path: variant.path,
          tokens: variant.tokens,
          background: variant.background,
          image,
          veil: variant.veil,
          request: run.request.slice(0, 300),
          description: variant.description.slice(0, 600),
          score: null,
          round,
          created_at: Date.now(),
        });
      }
      if (skins.length === 0 && response.error) throw new Error(response.error);
      run = { ...run, spent_micro: run.spent_micro + cost };
      emit(run);
      return { variants: skins, costMicro: cost };
    },
    score: async ({ variants, signal }) => {
      const response = await post<ScoreResponse>(
        `${base}/skin/score`,
        {
          boxId,
          material: run.material,
          target: run.target,
          variants: variants.map((skin) => ({
            id: skin.id,
            description: skin.path === 'image_generate' || skin.path === 'image_search' ? '' : `${skin.name}: ${skin.description} Colours ${JSON.stringify(skin.tokens)}. Background CSS: ${(skin.background ?? 'none').slice(0, 500)}`,
            image: imageData.get(skin.id) ?? skin.image?.thumb ?? (skin.image?.ref.startsWith('https://') ? skin.image.ref : null),
          })),
        },
        signal,
      );
      const cost = ledger(response.entries);
      run = { ...run, spent_micro: run.spent_micro + cost };
      return {
        costMicro: cost,
        scores: variants.map((skin, index) => {
          const scored = response.scores[index];
          // Image skins take their colours from what the vision model saw.
          if (scored?.palette && skin.image && Object.keys(skin.tokens).length === 0) {
            skin.tokens = ensureReadable({ ...scored.palette, '--bg-elevated': scored.palette['--surface'] ?? scored.palette['--bg'] ?? '' });
            if (!skin.tokens['--bg-elevated']) delete skin.tokens['--bg-elevated'];
          }
          skin.score = scored?.score ?? null;
          return { score: scored?.score ?? 2.5, note: scored?.note ?? '' };
        }),
      };
    },
    onRound: (round) => {
      run = {
        ...run,
        rounds: [
          ...run.rounds,
          {
            round: round.round,
            winner: round.winner,
            variants: round.variants.map((entry: Scored<Skin>) => ({ skin: { ...entry.variant, score: entry.score }, score: entry.score, note: entry.note.slice(0, 600) })),
          },
        ],
      };
      // Show the new best at once when a round improves on it.
      const top = round.variants[round.winner];
      if (top && top.score > bestScore) {
        bestScore = top.score;
        const applied = store.applyOps(boxId, [{ op: 'skin.apply', skin: { ...top.variant, score: top.score } }], 'assistant');
        if (applied.ok) run = { ...run, applied: top.variant.id };
      }
      emit(run);
    },
  });

  return finish({ reason: result.reason, error: result.error ?? null });
}
