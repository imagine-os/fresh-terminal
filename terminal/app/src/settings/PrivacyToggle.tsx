import { useEffect, useState } from 'react';
import { useAccount } from '../auth/Account';
import { useI18n } from '../i18n';
import { routerFetch } from '../lib/routerFetch';

/**
 * "Share my data with Fresh Terminal to improve it (off by default)" (C-090).
 * Signed-in only: the setting lives on the account (PUT /me/privacy). Off means
 * Fresh Terminal's admin tools see totals only, never your stages or prompts.
 */
export function PrivacyToggle() {
  const { t } = useI18n();
  const account = useAccount();
  const [share, setShare] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!account.signedIn) return;
    let live = true;
    routerFetch('/me/privacy', { method: 'GET' })
      .then(async (response) => (response.ok ? ((await response.json()) as { share_data: boolean }) : null))
      .then((body) => live && setShare(body ? body.share_data : null))
      .catch(() => live && setShare(null));
    return () => {
      live = false;
    };
  }, [account.signedIn]);

  if (!account.signedIn) return <p className="canvas-meta">{t('privacy.signedOut')}</p>;
  const change = async (next: boolean) => {
    setBusy(true);
    try {
      const response = await routerFetch('/me/privacy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ share_data: next }) });
      if (response.ok) setShare(((await response.json()) as { share_data: boolean }).share_data);
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="pay-option" data-checked={share === true} data-testid="privacy-share">
      <input type="checkbox" checked={share === true} disabled={share === null || busy} onChange={(event) => void change(event.target.checked)} />
      <span>
        <strong>{t('privacy.share')}</strong>
        <span className="canvas-meta">{t('privacy.explain')}</span>
      </span>
    </label>
  );
}
