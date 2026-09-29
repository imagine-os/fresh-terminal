import { useI18n } from '../i18n';
import { Button } from '../ui/Button';

/** Shown instead of a model reply when no router is deployed for this site. */
export function NoRouter() {
  const { t } = useI18n();
  return (
    <div className="pm-tabs" style={{ marginTop: '0.4rem' }}>
      <Button variant="primary" onClick={() => window.dispatchEvent(new CustomEvent('ft:open-settings'))} data-testid="open-settings-inline">
        {t('system.openSettings')}
      </Button>
    </div>
  );
}
