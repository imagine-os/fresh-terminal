import { useI18n } from '../i18n';
import { NotWiredButton } from '../ui/NotWiredButton';

/** Demo composition: a login screen. Submitting is not wired (Clerk, pass 2). */
export function LoginScreen() {
  const { t } = useI18n();
  return (
    <div className="composition" data-testid="composition-login">
      <div className="composition-label">
        <span>demo composition · login screen</span>
        <span>{t('notWired')}: Clerk</span>
      </div>
      <form
        className="login"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label className="field">
          <span>Email</span>
          <input type="email" name="email" autoComplete="email" placeholder="you@example.com" />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" placeholder="••••••••" />
        </label>
        <NotWiredButton what="Clerk sign-in" label={t('topbar.save')}>
          {t('topbar.save')}
        </NotWiredButton>
      </form>
    </div>
  );
}
