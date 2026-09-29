import { useEffect, useState } from 'react';
import { formatMicro } from '@shared/ledger';
import { useAccount } from '../auth/Account';
import { claimReferralCode, isInviteCode, redeemInviteCode } from '../credits/billing';
import { useI18n } from '../i18n';
import { routerFetch } from '../lib/routerFetch';
import { Button } from '../ui/Button';
import { NotWiredButton } from '../ui/NotWiredButton';
import { useToast } from '../ui/Toast';

interface Summary {
  link: string;
  friends: number;
  rewarded: number;
  pending: number;
  earned_micro: number;
  share_due_micro: number;
  welcome: { state: string; message: string | null } | null;
}

/**
 * Settings → Invite (C-107): your referral link, how many friends came, what it earned, and one
 * field for any code (an admin invite code FT-XXXX-XXXX, or a friend's referral code).
 */
export function ReferralPanel() {
  const { t } = useI18n();
  const { toast } = useToast();
  const account = useAccount();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    routerFetch('/me/referral', { method: 'GET' })
      .then(async (response) => (response.ok ? ((await response.json()) as Summary) : null))
      .then(setSummary)
      .catch(() => setSummary(null));

  useEffect(() => {
    if (account.signedIn) void load();
  }, [account.signedIn]);

  if (!account.signedIn) return <p className="canvas-meta">{t('referral.signedOut')}</p>;

  const copy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.link);
      toast(t('referral.copied'));
    } catch {
      toast(summary.link);
    }
  };
  const redeem = async () => {
    const value = code.trim();
    if (!value) return;
    setBusy(true);
    try {
      if (isInviteCode(value)) {
        const result = await redeemInviteCode(value);
        toast(result.ok ? t('invite.done', { amount: result.amount }) : result.message);
      } else {
        const result = await claimReferralCode(value);
        toast(result.ok ? t('referral.claimed', { amount: result.bonus }) : result.message);
      }
      setCode('');
      void load();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="referral-panel" data-testid="referral-panel">
      <p className="canvas-meta">{t('referral.rules')}</p>
      {summary?.welcome?.message ? <p className="canvas-meta" data-testid="welcome-line">{summary.welcome.message}</p> : null}
      <div className="referral-link">
        <label htmlFor="referral-link" className="sr-only">
          {t('referral.link')}
        </label>
        <input id="referral-link" readOnly value={summary?.link ?? '…'} onFocus={(event) => event.target.select()} data-testid="referral-link" />
        <Button onClick={() => void copy()} disabled={!summary}>
          {t('referral.copy')}
        </Button>
      </div>
      <dl className="referral-stats">
        <div>
          <dt>{t('referral.friends')}</dt>
          <dd data-testid="referral-friends">{summary ? summary.friends : '…'}</dd>
        </div>
        <div>
          <dt>{t('referral.rewarded')}</dt>
          <dd>{summary ? summary.rewarded : '…'}</dd>
        </div>
        <div>
          <dt>{t('referral.earned')}</dt>
          <dd data-testid="referral-earned">{summary ? formatMicro(summary.earned_micro, 2) : '…'}</dd>
        </div>
      </dl>
      <NotWiredButton what={t('referral.cashOut')} label={t('referral.cashOut')}>
        {t('referral.cashOut')}
      </NotWiredButton>
      <div className="referral-link">
        <label htmlFor="referral-code">{t('referral.haveCode')}</label>
        <input id="referral-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="FT-7K2M-QX9P" autoComplete="off" />
        <Button onClick={() => void redeem()} disabled={busy || code.trim().length < 6}>
          {t('referral.redeem')}
        </Button>
      </div>
    </div>
  );
}
