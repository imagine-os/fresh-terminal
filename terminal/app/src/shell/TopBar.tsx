import { PRODUCT_NAME } from '@shared/brand';
import { formatMicro } from '@shared/ledger';
import type { Theme } from '@shared/themes';
import { shortcutFor } from '../actions/registry';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { NotWiredButton } from '../ui/NotWiredButton';
import { Tooltip } from '../ui/Tooltip';
import { IconBox, IconDev, IconKey, IconLang, IconLibrary, IconPlus, IconSave, IconSidebar, IconTheme } from '../ui/icons';

interface Props {
  boxName: string;
  theme: Theme;
  devMode: boolean;
  usedMicro: number;
  showSave: boolean;
  onNewBox: () => void;
  onToggleSidebar: () => void;
  onCycleTheme: () => void;
  onToggleDev: () => void;
  onToggleLang: () => void;
  onHome: () => void;
  onCanvas: () => void;
  canvasActive: boolean;
  onSettings: () => void;
  payMode: 'ours' | 'own';
  libraryHref: string;
}

function key(id: string): string {
  const shortcut = shortcutFor(id) ?? '';
  return shortcut.length === 1 ? shortcut.toUpperCase() : shortcut;
}

export function TopBar(props: Props) {
  const { t, lang } = useI18n();
  return (
    <>
      <Tooltip label={PRODUCT_NAME} align="start">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          onClick={(event) => {
            event.preventDefault();
            props.onHome();
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            &gt;_
          </span>
          <span>{PRODUCT_NAME}</span>
        </a>
      </Tooltip>
      <span className="tagline">{props.boxName ? `/ ${props.boxName}` : t('landing.tagline')}</span>
      <span className="topbar-spacer" />
      <span className="balance" data-live={props.usedMicro > 0} data-testid="balance" aria-label={`${formatMicro(props.usedMicro)} ${t('topbar.used')}`}>
        {formatMicro(props.usedMicro)} {t('topbar.used')} · {t(props.payMode === 'own' ? 'pay.mode.own' : 'pay.mode.ours')}
      </span>
      <span className="topbar-group">
        <Tooltip label={t('topbar.newBox')} shortcut={key('box.new')}>
          <Button icon variant="ghost" aria-label={t('topbar.newBox')} onClick={props.onNewBox} data-testid="new-box">
            <IconPlus />
          </Button>
        </Tooltip>
        <Tooltip label={t('topbar.canvas')} shortcut={key('canvas.open')}>
          <Button icon variant="ghost" aria-label={t('topbar.canvas')} aria-pressed={props.canvasActive} onClick={props.onCanvas} data-testid="canvas-link">
            <IconBox />
          </Button>
        </Tooltip>
        <Tooltip label={t('topbar.library')} shortcut={key('library.open')}>
          <a className="btn" data-variant="ghost" data-icon="true" aria-label={t('topbar.library')} href={props.libraryHref} data-testid="library-link">
            <IconLibrary />
          </a>
        </Tooltip>
        <Tooltip label={t('topbar.toggleSidebar')} shortcut={key('sidebar.toggle')}>
          <Button icon variant="ghost" aria-label={t('topbar.toggleSidebar')} onClick={props.onToggleSidebar}>
            <IconSidebar />
          </Button>
        </Tooltip>
        <Tooltip label={`${t('topbar.theme')}: ${props.theme.name}`} shortcut={key('theme.cycle')}>
          <Button icon variant="ghost" aria-label={`${t('topbar.theme')}: ${props.theme.name}`} onClick={props.onCycleTheme}>
            <IconTheme />
          </Button>
        </Tooltip>
        <Tooltip label={t('topbar.language')} shortcut={key('lang.toggle')}>
          <Button icon variant="ghost" aria-label={t('topbar.language')} onClick={props.onToggleLang}>
            <IconLang />
            <span className="sr-only">{lang}</span>
          </Button>
        </Tooltip>
        <Tooltip label={t('topbar.settings')} shortcut={key('settings.open')}>
          <Button icon variant="ghost" aria-label={t('topbar.settings')} onClick={props.onSettings} data-testid="settings-link">
            <IconKey />
          </Button>
        </Tooltip>
        <Tooltip label={t('topbar.devMode')} shortcut={key('dev.toggle')} align="end">
          <Button icon variant="ghost" aria-label={t('topbar.devMode')} aria-pressed={props.devMode} onClick={props.onToggleDev}>
            <IconDev />
          </Button>
        </Tooltip>
        {props.showSave || props.devMode ? (
          <NotWiredButton what="Clerk sign-in" label={t('topbar.save')} icon align="end">
            <IconSave />
          </NotWiredButton>
        ) : null}
      </span>
    </>
  );
}
