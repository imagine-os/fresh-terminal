import { admin, hubData, type TokenFn } from './api';

/** What the hub needs from the outside world. Live: the gated site data and the router. Sample: local preview only. */
export interface HubClient {
  data<T>(name: string): Promise<T>;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

export function liveClient(token: TokenFn): HubClient {
  return {
    data: (name) => hubData(name, token),
    get: (path) => admin(path, token),
    post: (path, body) => admin(path, token, body),
  };
}

/** Local preview (localhost with ?sample=1): real docs data from the local build, made-up admin numbers, clearly labelled. */
export function isLocalPreview(): boolean {
  if (typeof window === 'undefined') return false;
  const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return local && new URLSearchParams(window.location.search).get('sample') === '1';
}

type Row = Record<string, unknown>;

export function sampleClient(): HubClient {
  const now = Date.UTC(2026, 8, 29, 5, 0, 0);
  const grants: Row[] = [
    { id: 'grant_sample_2', account_id: 'acct_user_friend_b', clerk_user_id: 'user_friend_b', amount_micro: 3_000_000, source: 'invite', invite_code: 'FT-SAMP-LE22', granted_by: 'user_sample', note: 'friends batch', created_at: now - 3_600_000 },
    { id: 'grant_sample_1', account_id: 'acct_user_friend_a', clerk_user_id: 'user_friend_a', amount_micro: 10_000_000, source: 'admin', invite_code: null, granted_by: 'user_sample', note: 'thanks for testing', created_at: now - 7_200_000 },
  ];
  const invites: Row[] = [{ code: 'FT-SAMP-LE22', amount_micro: 3_000_000, max_uses: 5, uses: 1, created_by: 'user_sample', note: 'friends batch', expires_at: null, disabled: 0, created_at: now - 9_000_000 }];
  const ledger: Row[] = [
    { account_id: 'acct_user_friend_b', id: 'srv_grant_sample_2', kind: 'credit', what: 'credit.invite', model: '', cost_micro: 0, price_micro: 3_000_000, created_at: now - 3_600_000 },
    { account_id: 'acct_user_friend_a', id: 'e_2', kind: 'charge', what: 'model.call', model: 'anthropic/claude-haiku-4.5', cost_micro: 5_100, price_micro: 6_000, created_at: now - 3_000_000 },
    { account_id: 'acct_user_friend_a', id: 'srv_grant_sample_1', kind: 'credit', what: 'credit.grant', model: '', cost_micro: 0, price_micro: 10_000_000, created_at: now - 7_200_000 },
  ];
  const answer = async <T,>(value: unknown) => value as T;
  return {
    data: async <T,>(name: string) => (await (await fetch(`/hub/data/${name}.json`)).json()) as T,
    get: async <T,>(path: string) => {
      if (path.startsWith('/admin/overview'))
        return answer<T>({
          accounts: { n: 7, spent: 2_340_000, cost: 1_950_000, needs_payment: 1, active: 0 },
          grants: { n: grants.length, total: grants.reduce((sum, row) => sum + Number(row.amount_micro), 0) },
          invites: { n: invites.length, open: 1 },
          devices: { n: 41, spent: 3_100_000, cost: 2_600_000 },
          billing: { provider: 'not-wired', default_threshold_micro: 5_000_000, topup_amounts_usd: [5, 10, 20, 50] },
          admins: { ids: 1, emails: 1, you_via: 'id' },
          max_grant_micro: 100_000_000,
        });
      if (path.startsWith('/admin/grants')) return answer<T>({ grants });
      if (path.startsWith('/admin/invites')) return answer<T>({ invites });
      if (path.startsWith('/admin/ledger')) return answer<T>({ entries: ledger });
      return answer<T>({});
    },
    post: async <T,>(path: string, body: unknown) => {
      const input = (body ?? {}) as Row;
      if (path === '/admin/grant') {
        const grant = { id: `grant_sample_${grants.length + 1}`, account_id: 'acct_user_new', clerk_user_id: String(input.user_id ?? 'user_new'), amount_micro: Math.round(Number(input.amount_usd) * 1e6), source: 'admin', granted_by: 'user_sample', note: input.note, created_at: Date.now() };
        grants.unshift(grant);
        return answer<T>({ grant, account: { grant_micro: grant.amount_micro + 1_000_000, remaining_micro: grant.amount_micro + 1_000_000 }, email: input.email ?? null });
      }
      if (path === '/admin/invites') {
        const invite = { code: 'FT-NEWS-AMPL', amount_micro: Math.round(Number(input.amount_usd) * 1e6), max_uses: input.uses, uses: 0, created_by: 'user_sample', note: input.note ?? '', expires_at: null, disabled: 0, created_at: Date.now() };
        invites.unshift(invite);
        return answer<T>({ invite });
      }
      if (path === '/admin/invites/disable') {
        const row = invites.find((invite) => invite.code === input.code);
        if (row) row.disabled = 1;
        return answer<T>({ disabled: Boolean(row) });
      }
      if (path === '/admin/account') return answer<T>({ account: { billing_threshold_micro: Math.round(Number(input.billing_threshold_usd ?? 5) * 1e6), billing_state: input.billing_state ?? 'free' } });
      return answer<T>({});
    },
  };
}
