import { PRODUCT_NAME } from '@shared/brand';
import { formatMicro } from '@shared/ledger';
import type { Theme } from '@shared/themes';
import type { NavItem, NavTarget } from '@shared/ui';
import { shortcutFor } from '../actions/registry';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { IconBox, IconDev, IconDownload, IconKey, IconLang, IconLibrary, IconPlus, IconReplay, IconSidebar, IconTheme, IconTopBar, IconUpload } from '../ui/icons';
import { AccountButton } from './AccountButton';
import { Tray, type Tool } from './Tray';

interface Props {
  boxName: string;
  theme: Theme;
  devMode: boolean;
  usedMicro: number;
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
  onReplay: () => void;
  replayActive: boolean;
  /** Tools pinned back onto the bar; everything else waits in the tray. */
  pinned: string[];
  onPinned: (ids: string[]) => void;
  nav: NavItem[];
  onNavigate: (target: NavTarget, item: NavItem) => void;
  onExport: () => void;
  onImport: () => void;
  onHideTopBar: () => void;
}

function key(id: string): string {
  const shortcut = shortcutFor(id) ?? '';
  return shortcut.length === 1 ? shortcut.toUpperCase() : shortcut;
}

/**
 * Top bar: brand, the money counter, the sign-in slot and the tray. Every
 * other tool lives in the tray until it is pinned (decision C-071).
 */
export function TopBar(props: Props) {
  const { t, lang } = useI18n();
  const tools: Tool[] = [
    { id: 'box.new', label: t('topbar.newBox'), icon: <IconPlus />, onClick: props.onNewBox, shortcut: key('box.new'), testId: 'new-box' },
    { id: 'canvas.open', label: t('topbar.canvas'), icon: <IconBox />, onClick: props.onCanvas, shortcut: key('canvas.open'), pressed: props.canvasActive, testId: 'canvas-link' },
    { id: 'library.open', label: t('topbar.library'), icon: <IconLibrary />, onClick: () => {}, href: props.libraryHref, shortcut: key('library.open'), testId: 'library-link' },
    { id: 'play.open', label: t('topbar.replay'), icon: <IconReplay />, onClick: props.onReplay, shortcut: key('play.open'), pressed: props.replayActive, testId: 'replay-link' },
    { id: 'sidebar.toggle', label: t('topbar.toggleSidebar'), icon: <IconSidebar />, onClick: props.onToggleSidebar, shortcut: key('sidebar.toggle') },
    { id: 'theme.cycle', label: `${t('topbar.theme')}: ${props.theme.name}`, icon: <IconTheme />, onClick: props.onCycleTheme, shortcut: key('theme.cycle') },
    { id: 'lang.toggle', label: `${t('topbar.language')} (${lang})`, icon: <IconLang />, onClick: props.onToggleLang, shortcut: key('lang.toggle') },
    { id: 'settings.open', label: t('topbar.settings'), icon: <IconKey />, onClick: props.onSettings, shortcut: key('settings.open'), testId: 'settings-link' },
    { id: 'dev.toggle', label: t('topbar.devMode'), icon: <IconDev />, onClick: props.onToggleDev, shortcut: key('dev.toggle'), pressed: props.devMode },
    { id: 'session.export', label: t('firstRun.export'), icon: <IconDownload />, onClick: props.onExport, testId: 'export-session' },
    { id: 'session.import', label: t('import.label'), icon: <IconUpload />, onClick: props.onImport, testId: 'import-session' },
    { id: 'bar.toggle', label: t('topbar.hide'), icon: <IconTopBar />, onClick: props.onHideTopBar, shortcut: key('bar.toggle'), testId: 'hide-bar' },
  ];
  return (
    <>
      <Tooltip label={t('topbar.boxes')} shortcut={key('sidebar.toggle')} align="start">
        <Button icon variant="ghost" className="boxes-toggle" aria-label={t('topbar.boxes')} onClick={props.onToggleSidebar} data-testid="boxes-toggle">
          <IconSidebar />
        </Button>
      </Tooltip>
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
        <Tray tools={tools} pinned={props.pinned} onPinned={props.onPinned} nav={props.nav} onNavigate={props.onNavigate} />
        <AccountButton />
      </span>
    </>
  );
}
