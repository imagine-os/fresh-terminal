import { describe, expect, it } from 'vitest';
import { createApp } from '@router/src/app';
import { fakeD1 } from '@router/src/testing/fakeD1';
import { LocalStore } from '../store/local';
import { CloudSync, fingerprint, type SyncStatus } from './cloud';

/** Two browsers (two LocalStores) signed in as the same person, talking to one router + D1. */
function setup() {
  const db = fakeD1();
  let clock = 1_000_000;
  const now = () => (clock += 10);
  const router = createApp({
    bindings: () => ({ CLERK_SECRET_KEY: 'sk_test_x' }),
    resources: () => ({ DB: db }),
    verifier: async (token) => ({ sub: token }),
    now,
  });
  const fetchImpl: typeof fetch = async (input, init) => router.request(String(input).replace('https://api.test', ''), init);
  const device = (identity: string) => {
    const store = new LocalStore(identity);
    const statuses: SyncStatus[] = [];
    const sync = new CloudSync({
      routerUrl: 'https://api.test',
      userId: `user_1_${identity}`,
      getToken: async () => 'user_1',
      source: { syncBoxes: () => store.syncBoxes(), importSyncBoxes: (rows) => store.importSyncBoxes(rows), entries: () => store.getSnapshot().entries },
      fetchImpl,
      now,
      onStatus: (status) => statuses.push(status),
    });
    return { store, sync, statuses };
  };
  return { device };
}

describe('CloudSync', () => {
  it('moves a box and its menu from one browser to another, then a rename back', async () => {
    const { device } = setup();
    const a = device('anon_a');
    const b = device('anon_b');
    const box = a.store.createBox('Shop');
    a.store.appendEntry({ box_id: box.id, kind: 'charge', what: 'model.call', model: 'm', units: 1, unit_kind: 'call', cost_micro: 5, price_micro: 6, ref: '', created_at: 1 });
    await a.sync.sync();
    expect(a.statuses.at(-1)).toMatchObject({ state: 'ok', boxes: 1 });

    await b.sync.sync();
    const onB = b.store.getSnapshot().boxes.find((candidate) => candidate.id === box.id);
    expect(onB?.name).toBe('Shop');
    expect(onB?.owner_identity).toBe('anon_b');
    expect(b.store.uiState(box.id).nav.length).toBe(a.store.uiState(box.id).nav.length);

    const nav = b.store.uiState(box.id).nav[0];
    expect(nav).toBeDefined();
    const result = b.store.applyOps(box.id, [{ op: 'nav.rename', item: nav!.id, label: 'Front' }], 'local');
    expect(result.ok).toBe(true);
    await b.sync.sync();
    await a.sync.sync();
    expect(a.store.uiState(box.id).nav.find((item) => item.id === nav!.id)?.label).toBe('Front');
  });

  it('keeps a local edit made while another device changed the same box (local wins, newer stamp)', async () => {
    const { device } = setup();
    const a = device('anon_a');
    const b = device('anon_b');
    const box = a.store.createBox('Plan');
    await a.sync.sync();
    await b.sync.sync();
    const navA = a.store.uiState(box.id).nav[0]!;
    a.store.applyOps(box.id, [{ op: 'nav.rename', item: navA.id, label: 'From A' }], 'local');
    await a.sync.sync();
    b.store.applyOps(box.id, [{ op: 'nav.rename', item: navA.id, label: 'From B' }], 'local');
    await b.sync.sync();
    await a.sync.sync();
    expect(b.store.uiState(box.id).nav.find((item) => item.id === navA.id)?.label).toBe('From B');
    expect(a.store.uiState(box.id).nav.find((item) => item.id === navA.id)?.label).toBe('From B');
  });

  it('reports an error status instead of throwing when signed out', async () => {
    const store = new LocalStore('anon_x');
    const statuses: SyncStatus[] = [];
    const sync = new CloudSync({
      routerUrl: 'https://api.test',
      userId: 'u',
      getToken: async () => null,
      source: { syncBoxes: () => store.syncBoxes(), importSyncBoxes: (rows) => store.importSyncBoxes(rows), entries: () => [] },
      fetchImpl: async () => new Response('{}'),
      onStatus: (status) => statuses.push(status),
    });
    await sync.sync();
    expect(statuses.at(-1)).toEqual({ state: 'error', message: 'Signed out' });
  });

  it('fingerprints change with the name or state', () => {
    expect(fingerprint({ name: 'a', state_json: '{}' })).not.toBe(fingerprint({ name: 'b', state_json: '{}' }));
    expect(fingerprint({ name: 'a', state_json: '{}' })).toBe(fingerprint({ name: 'a', state_json: '{}' }));
  });
});
