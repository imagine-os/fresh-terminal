import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { HubError, usd, when } from './api';
import type { HubClient } from './client';
import { Status } from './Status';

/**
 * The admin credits panel (2026-09-29, C-087): grant credit by email or Clerk
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
  privacy?: Row;
  /** C-105, C-106, C-107: totals only. */
  markup?: Row;
  welcome?: Row;
  referrals?: Row;
  billing: { provider: string; default_threshold_micro: number; starter_micro?: number };
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
  const [privateTotals, setPrivateTotals] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [o, g, i, l] = await Promise.all([
        client.get<Overview>('/admin/overview'),
        client.get<{ grants: Row[] }>('/admin/grants?limit=25'),
        client.get<{ invites: Row[] }>('/admin/invites'),
        client.get<{ entries: Row[]; private_totals?: Row[] }>('/admin/ledger?limit=25'),
      ]);
      setOverview(o);
      setGrants(g.grants);
      setInvites(i.invites);
      setLedger(l.entries);
      setPrivateTotals(l.private_totals ?? []);
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
            <dt>Starter kit per account</dt>
            <dd>{usd(Number(overview.billing.starter_micro ?? overview.billing.default_threshold_micro))}</dd>
          </div>
          <div>
            <dt>Open invite codes</dt>
            <dd>{String(overview.invites.open ?? 0)}</dd>
          </div>
          <div>
            <dt>Need to buy credits</dt>
            <dd>{String(overview.accounts.needs_payment ?? 0)}</dd>
          </div>
          <div>
            <dt>Sharing their data</dt>
            <dd>
              {String(overview.privacy?.sharing ?? 0)} <span className="hub-muted">of {String(overview.accounts.n ?? 0)}</span>
            </dd>
          </div>
          <div>
            <dt>Stored with us</dt>
            <dd>{(Number(overview.privacy?.stored_bytes ?? 0) / 1_000_000).toFixed(1)} MB</dd>
          </div>
          <div>
            <dt>Average markup</dt>
            <dd>
              {(Number(overview.markup?.average_bp ?? 1000) / 100).toFixed(1)}% <span className="hub-muted">{String(overview.markup?.chosen ?? 0)} chose their own</span>
            </dd>
          </div>
          <div>
            <dt>Welcome credit</dt>
            <dd>
              {String(overview.welcome?.granted ?? 0)} <span className="hub-muted">given, {String(overview.welcome?.blocked ?? 0)} blocked, {String(overview.welcome?.pending ?? 0)} waiting</span>
            </dd>
          </div>
          <div>
            <dt>Referrals</dt>
            <dd>
              {String(overview.referrals?.rewarded ?? 0)} <span className="hub-muted">rewarded of {String(Number(overview.referrals?.claims ?? 0) - Number(overview.referrals?.refused ?? 0))}; {usd(Number(overview.referrals?.bonus_micro ?? 0) + Number(overview.referrals?.reward_micro ?? 0) + Number(overview.referrals?.share_paid_micro ?? 0))} credited</span>
            </dd>
          </div>
          <div>
            <dt>Payments</dt>
            <dd>
              <Status value={overview.billing.provider === 'stripe' || overview.billing.provider === 'clerk' ? 'live' : 'not wired'} />
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
      <p className="hub-muted">Credit lines are ours. Everything else shows line by line only for people who share their data or granted access; the rest are totals.</p>
      <Table
        label="Recent ledger"
        empty="No lines you can see."
        head={['When', 'Account', 'Kind', 'What', 'Price', 'Cost']}
        rows={ledger.map((entry) => [when(Number(entry.created_at)), <code key="a">{String(entry.account_id)}</code>, String(entry.kind), String(entry.what) + (entry.model ? ` · ${String(entry.model)}` : ''), usd(Number(entry.price_micro), 4), usd(Number(entry.cost_micro), 4)])}
      />
      <h3>Private accounts (totals only)</h3>
      <Table
        label="Private accounts, totals only"
        empty="None in the recent lines."
        head={['Account', 'Lines', 'Price', 'Cost', 'Markup', 'Last']}
        rows={privateTotals.map((total) => [<code key="a">{String(total.account_id)}</code>, String(total.entries), usd(Number(total.price_micro), 4), usd(Number(total.cost_micro), 4), usd(Math.max(0, Number(total.price_micro) - Number(total.cost_micro)), 4), when(Number(total.last_at))])}
      />
      <PrivacySelf client={client} />
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
      <p className="hub-muted">Free usage an account gets before it needs to buy credits. Default $5, at model cost; bought credits run at model cost + 10% (C-104). Buying credits is not wired yet.</p>
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

/** The admin's own switch, the same one every account has in Settings (C-091). */
function PrivacySelf({ client }: { client: HubClient }) {
  const [share, setShare] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    client
      .get<{ share_data: boolean }>('/me/privacy')
      .then((body) => setShare(body.share_data))
      .catch((caught: unknown) => setError(message(caught)));
  }, [client]);
  return (
    <section className="hub-form" aria-labelledby="privacy-title">
      <h3 id="privacy-title">Your privacy</h3>
      <label className="hub-check">
        <input
          type="checkbox"
          checked={share === true}
          disabled={share === null}
          onChange={(event) => {
            const next = event.target.checked;
            void client
              .put<{ share_data: boolean }>('/me/privacy', { share_data: next })
              .then((body) => setShare(body.share_data))
              .catch((caught: unknown) => setError(message(caught)));
          }}
        />
        <span>Share my data with Fresh Terminal to improve it (off by default)</span>
      </label>
      <p className="hub-muted">
        Off for everyone unless they turn it on. Without it, or an access grant from them, this hub shows their totals only. Honest limits and the next step (encryption with a key the person holds) are in{' '}
        <a href="/wiki/canon/open-questions.html">open question 19</a>.
      </p>
      {error ? <p className="hub-alert">{error}</p> : null}
    </section>
  );
}
