import { UserButton } from '@clerk/react';
import { useAccount } from '../auth/Account';
import { hasSignedInBefore, signInLabelKeys } from '../auth/firstSignIn';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { NotWiredButton } from '../ui/NotWiredButton';
import { Tooltip } from '../ui/Tooltip';

/**
 * Header account control. Signed out: a "Sign in" button that opens Clerk.
 * Signed in: the Clerk user menu plus a sync dot. No Clerk key in the build:
 * the same button, marked not wired yet.
 */
export function AccountButton() {
  const account = useAccount();
  const { t } = useI18n();

  if (!account.available) {
    return (
      <NotWiredButton what={t('account.notWired')} label={t('account.signIn')} align="end">
        <span className="account-label">{t('account.signIn')}</span>
      </NotWiredButton>
    );
  }

  if (!account.signedIn) {
    // First sign-up offer: "Get $5 free" until this device has signed in once, then "Sign in".
    const keys = signInLabelKeys(hasSignedInBefore());
    return (
      <Tooltip label={account.loaded ? t(keys.tip) : t('account.loading')} align="end">
        <Button variant="ghost" className="account-signin" onClick={account.signIn} disabled={!account.loaded} data-testid="sign-in" aria-label={t(keys.label)}>
          <span className="account-label">{t(keys.label)}</span>
        </Button>
      </Tooltip>
    );
  }

  const sync = account.sync;
  const syncLabel =
    sync.state === 'ok'
      ? t('account.sync.ok', { count: String(sync.boxes) })
      : sync.state === 'error'
        ? t('account.sync.error', { message: sync.message })
        : sync.state === 'syncing'
          ? t('account.sync.running')
          : t('account.sync.off');
  return (
    <span className="account-signed-in" data-testid="account">
      <Tooltip label={syncLabel} align="end">
        <Button variant="ghost" icon className="sync-dot-button" aria-label={syncLabel} onClick={account.syncNow} data-sync={sync.state}>
          <span className="sync-dot" aria-hidden="true" />
        </Button>
      </Tooltip>
      <UserButton />
    </span>
  );
}
