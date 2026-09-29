import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { HubError, usd, when } from './api';
import type { HubClient } from './client';
import { Status } from './Status';

/**
 * The admin credits panel (2026-09-29, C-085): grant credit by email or Clerk
 * user id, make and switch off invite codes, set an account's billing
 * threshold, and read recent grants and the ledger. The router checks admin on
 * every call; this panel only shows what it answers.
 */
type Row = Record<string, unknown>;

interface Overview {
  accounts: Row;
  grants: Row;
  invites: Row;
  devices: Row;
  billing: { provider: string; default_threshold_micro: number };
  max_grant_micro: number;
}

function message(error: unknown): string {
  if (error instanceof HubError) return `${error.message}${error.code ? ` (${error.code})` : ''}`;
  return error instanceof Error ? error.message : String(error);
}

function target(value: string): { user_id: string } | { email: string } {
  const trimmed = value.trim();
  return trimmed.startsWith('user_') ? { user_id: trimmed } : { email: trimmed };
}

export function CreditsPanel({ client }: { client: HubClient }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [grants, setGrants] = useState<Row[]>([]);
  const [invites, setInvites] = useState<Row[]>([]);
  const [ledger, setLedger] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [o, g, i, l] = await Promise.all([
        client.get<Overview>('/admin/overview'),
        client.get<{ grants: Row[] }>('/admin/grants?limit=25'),
        client.get<{ invites: Row[] }>('/admin/invites'),
        client.get<{ entries: Row[] }>('/admin/ledger?limit=25'),
      ]);
      setOverview(o);
      setGrants(g.grants);
      setInvites(i.invites);
      setLedger(l.entries);
      setError(null);
    } catch (caught) {
      setError(message(caught));
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="hub-credits">
      {error ? (
        <p role="alert" className="hub-alert">
          The router said: {error}
        </p>
      ) : null}
      {overview ? (
        <dl className="hub-stats">
          <div>
            <dt>Accounts</dt>
            <dd>{String(overview.accounts.n ?? 0)}</dd>
          </div>
          <div>
            <dt>Signed-in free usage spent</dt>
            <dd>{usd(Number(overview.accounts.spent))}</dd>
          </div>
          <div>
            <dt>Credit granted</dt>
            <dd>
              {usd(Number(overview.grants.total))} <span className="hub-muted">in {String(overview.grants.n ?? 0)}</span>
            </dd>
          </div>
          <div>
            <dt>Open invite codes</dt>
            <dd>{String(overview.invites.open ?? 0)}</dd>
          </div>
          <div>
            <dt>Need a payment method</dt>
            <dd>{String(overview.accounts.needs_payment ?? 0)}</dd>
          </div>
          <div>
            <dt>Payments</dt>
            <dd>
              <Status value={overview.billing.provider === 'stripe' ? 'live' : 'not wired'} />
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="hub-forms">
        <GrantForm client={client} max={overview?.max_grant_micro ?? 100_000_000} onDone={refresh} />
        <InviteForm client={client} onDone={refresh} />
        <ThresholdForm client={client} onDone={refresh} />
      </div>

      <h3>Invite codes</h3>
      <Table
        label="Invite codes"
        empty="No codes yet."
        head={['Code', 'Worth', 'Used', 'Note', 'Expires', '']}
        rows={invites.map((invite) => [
          <code key="c">{String(invite.code)}</code>,
          usd(Number(invite.amount_micro)),
          `${String(invite.uses)} of ${String(invite.max_uses)}`,
          String(invite.note ?? ''),
          invite.expires_at ? when(Number(invite.expires_at)) : 'never',
          Number(invite.disabled) === 1 ? (
            <span key="d" className="hub-muted">
              off
            </span>
          ) : (
            <button
              key="b"
              type="button"
              className="hub-button hub-quiet"
              onClick={() => void client.post('/admin/invites/disable', { code: invite.code }).then(refresh).catch((caught: unknown) => setError(message(caught)))}
            >
              Switch off
            </button>
          ),
        ])}
      />

      <h3>Recent grants</h3>
      <Table
        label="Recent grants"
        empty="No grants yet."
        head={['When', 'To', 'Amount', 'How', 'By', 'Note']}
        rows={grants.map((grant) => [when(Number(grant.created_at)), <code key="u">{String(grant.clerk_user_id)}</code>, usd(Number(grant.amount_micro)), String(grant.source) + (grant.invite_code ? ` ${String(grant.invite_code)}` : ''), <code key="b">{String(grant.granted_by)}</code>, String(grant.note ?? '')])}
      />

      <h3>Recent ledger</h3>
      <Table
        label="Recent ledger"
        empty="Nothing on the ledger yet."
        head={['When', 'Account', 'Kind', 'What', 'Price', 'Cost']}
        rows={ledger.map((entry) => [when(Number(entry.created_at)), <code key="a">{String(entry.account_id)}</code>, String(entry.kind), String(entry.what) + (entry.model ? ` · ${String(entry.model)}` : ''), usd(Number(entry.price_micro), 4), usd(Number(entry.cost_micro), 4)])}
      />
    </div>
  );
}

function Table({ label, head, rows, empty }: { label: string; head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="hub-muted">{empty}</p>;
  return (
    <div className="hub-table" tabIndex={0} role="region" aria-label={label}>
      <table>
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={index} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Result({ text, tone }: { text: string | null; tone: 'ok' | 'error' }) {
  if (!text) return null;
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={tone === 'error' ? 'hub-alert' : 'hub-ok'}>
      {text}
    </p>
  );
}

function GrantForm({ client, max, onDone }: { client: HubClient; max: number; onDone: () => Promise<void> }) {
  const [who, setWho] = useState('');
  const [amount, setAmount] = useState('5');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const out = await client.post<{ grant: Row; account: Row | null; email: string | null }>('/admin/grant', { ...target(who), amount_usd: Number(amount), note });
      setResult({ text: `Granted ${usd(Number(out.grant.amount_micro))} to ${out.email ?? String(out.grant.clerk_user_id)}. They now have ${usd(Number(out.account?.remaining_micro ?? 0))} of free usage left.`, tone: 'ok' });
      setNote('');
      await onDone();
    } catch (caught) {
      setResult({ text: message(caught), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="hub-form" onSubmit={(event) => void submit(event)} aria-labelledby="grant-title">
      <h3 id="grant-title">Give credit</h3>
      <label>
        Email or Clerk user id
        <input required value={who} onChange={(event) => setWho(event.target.value)} placeholder="friend@example.com or user_…" autoComplete="off" />
      </label>
      <label>
        Amount (USD, up to {usd(max, 0)})
        <input required type="number" min="0.01" step="0.01" max={max / 1_000_000} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
      </label>
      <label>
        Note (why, kept on the ledger)
        <input required maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="thanks for testing" />
      </label>
      <button type="submit" className="hub-button" disabled={busy}>
        {busy ? 'Granting…' : 'Grant credit'}
      </button>
      <Result text={result?.text ?? null} tone={result?.tone ?? 'ok'} />
    </form>
  );
}

function InviteForm({ client, onDone }: { client: HubClient; onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState('5');
  const [uses, setUses] = useState('5');
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const out = await client.post<{ invite: Row }>('/admin/invites', { amount_usd: Number(amount), uses: Number(uses), note, ...(days ? { expires_days: Number(days) } : {}) });
      setCode(String(out.invite.code));
      setResult({ text: `Code made: worth ${usd(Number(out.invite.amount_micro))}, ${String(out.invite.max_uses)} uses. Friends enter it in the terminal after signing in (tray → Invite code).`, tone: 'ok' });
      await onDone();
    } catch (caught) {
      setResult({ text: message(caught), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="hub-form" onSubmit={(event) => void submit(event)} aria-labelledby="invite-title">
      <h3 id="invite-title">Make an invite code</h3>
      <label>
        Worth (USD each)
        <input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
      </label>
      <label>
        Uses
        <input required type="number" min="1" max="1000" step="1" value={uses} onChange={(event) => setUses(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Expires after (days, optional)
        <input type="number" min="1" max="365" step="1" value={days} onChange={(event) => setDays(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Note
        <input maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="friends batch" />
      </label>
      <button type="submit" className="hub-button" disabled={busy}>
        {busy ? 'Making…' : 'Make code'}
      </button>
      {code ? (
        <p className="hub-code">
          <code>{code}</code>
          <button type="button" className="hub-button hub-quiet" onClick={() => void navigator.clipboard?.writeText(code)}>
            Copy
          </button>
        </p>
      ) : null}
      <Result text={result?.text ?? null} tone={result?.tone ?? 'ok'} />
    </form>
  );
}

function ThresholdForm({ client, onDone }: { client: HubClient; onDone: () => Promise<void> }) {
  const [who, setWho] = useState('');
  const [threshold, setThreshold] = useState('5');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const out = await client.post<{ account: Row | null }>('/admin/account', { ...target(who), billing_threshold_usd: Number(threshold) });
      setResult({ text: `Threshold set to ${usd(Number(out.account?.billing_threshold_micro ?? 0))} (${String(out.account?.billing_state ?? 'free')}).`, tone: 'ok' });
      await onDone();
    } catch (caught) {
      setResult({ text: message(caught), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="hub-form" onSubmit={(event) => void submit(event)} aria-labelledby="threshold-title">
      <h3 id="threshold-title">Billing threshold</h3>
      <p className="hub-muted">Free usage an account gets before it needs a payment method. Default $5. Paying is not wired yet.</p>
      <label>
        Email or Clerk user id
        <input required value={who} onChange={(event) => setWho(event.target.value)} autoComplete="off" />
      </label>
      <label>
        Threshold (USD)
        <input required type="number" min="0" step="0.01" value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="decimal" />
      </label>
      <button type="submit" className="hub-button" disabled={busy}>
        {busy ? 'Saving…' : 'Set threshold'}
      </button>
      <Result text={result?.text ?? null} tone={result?.tone ?? 'ok'} />
    </form>
  );
}
