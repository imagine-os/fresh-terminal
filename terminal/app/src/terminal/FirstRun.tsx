import { useAccount } from '../auth/Account';
import { useI18n } from '../i18n';
import { usePrefs } from '../prefs';
import { Button } from '../ui/Button';
import { IconClose, IconDownload } from '../ui/icons';

interface Props {
  onExport: () => void;
}

/**
 * The first-run line: where your work lives, how to keep it, what it costs.
 * Shown until dismissed; the credits figure is a placeholder until the
 * router's credits endpoint lands (marked as such).
 */
export function FirstRun({ onExport }: Props) {
  const { t } = useI18n();
  const { prefs, set } = usePrefs();
  const account = useAccount();
  if (prefs.firstRunSeen) {
    return null;
  }
  return (
    <div className="first-run" role="note" data-testid="first-run">
      <span className="first-run-text">
        <b>{t('firstRun.saved')}</b> {account.signedIn ? t('firstRun.cloud') : t('firstRun.signIn')}{' '}
        <span className="first-run-credits" title={t('notWired')}>
          {t('firstRun.credits')}
        </span>
      </span>
      <span className="first-run-actions">
        <Button variant="ghost" onClick={onExport} data-testid="first-run-export">
          <IconDownload />
          <span className="btn-label">{t('firstRun.export')}</span>
        </Button>
        {!account.signedIn && account.available ? (
          <Button variant="ghost" onClick={account.signIn}>
            {t('account.signIn')}
          </Button>
        ) : null}
        <Button icon variant="ghost" aria-label={t('firstRun.dismiss')} onClick={() => set('firstRunSeen', true)} data-testid="first-run-dismiss">
          <IconClose />
        </Button>
      </span>
    </div>
  );
}
