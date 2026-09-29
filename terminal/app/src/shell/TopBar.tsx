import { PRODUCT_NAME, PRODUCT_VERSION, REPO_URL } from '@shared/brand';
import { formatMicro } from '@shared/ledger';
import type { Theme } from '@shared/themes';
import type { NavItem, NavTarget } from '@shared/ui';
import { shortcutFor } from '../actions/registry';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { IconBox, IconDev, IconDownload, IconHint, IconKey, IconLang, IconLibrary, IconPlus, IconReplay, IconSidebar, IconSpark, IconTheme, IconTopBar, IconUpload } from '../ui/icons';
import { useAccount } from '../auth/Account';
import { useCredits } from '../credits';
import { redeemInviteCode, startTopUp } from '../credits/billing';
import { useToast } from '../ui/Toast';
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
  /** Starter prompts and the how-it-works cards: tray switches since C-079. */
  startersOn: boolean;
  hintsOn: boolean;
  onToggleStarters: () => void;
  onToggleHints: () => void;
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
  const account = useAccount();
  const credits = useCredits();
  const { toast } = useToast();
  // C-084: wired only when the router says a payment provider is connected.
  const paymentsWired = credits.status?.billing?.provider === 'stripe';
  const onTopUp = async () => {
    if (!account.signedIn) {
      toast(t('billing.signInFirst'));
      return;
    }
    const result = await startTopUp();
    if (result.kind === 'redirect') {
      toast(t('billing.opening'));
      window.location.assign(result.url);
    } else if (result.kind === 'not-wired') toast(t('billing.notWired'));
    else if (result.kind === 'sign-in') toast(t('billing.signInFirst'));
    else toast(result.message);
  };
  const onInvite = async () => {
    if (!account.signedIn) {
      toast(t('invite.signIn'));
      return;
    }
    const code = window.prompt(t('invite.prompt'))?.trim();
    if (!code) return;
    const result = await redeemInviteCode(code);
    toast(result.ok ? t('invite.done', { amount: result.amount }) : result.signIn ? t('invite.signIn') : result.message);
  };
  const tools: Tool[] = [
    { id: 'box.new', group: 'go', label: t('topbar.newBox'), short: t('tool.newBox'), icon: <IconPlus />, onClick: props.onNewBox, shortcut: key('box.new'), testId: 'new-box' },
    { id: 'canvas.open', group: 'go', label: t('topbar.canvas'), short: t('tool.canvas'), icon: <IconBox />, onClick: props.onCanvas, shortcut: key('canvas.open'), pressed: props.canvasActive, testId: 'canvas-link' },
    { id: 'library.open', group: 'go', label: t('topbar.library'), short: t('tool.library'), icon: <IconLibrary />, onClick: () => {}, href: props.libraryHref, shortcut: key('library.open'), testId: 'library-link' },
    { id: 'play.open', group: 'go', label: t('topbar.replay'), short: t('tool.replay'), icon: <IconReplay />, onClick: props.onReplay, shortcut: key('play.open'), pressed: props.replayActive, testId: 'replay-link' },
    { id: 'sidebar.toggle', group: 'look', label: t('topbar.toggleSidebar'), short: t('tool.sidebar'), icon: <IconSidebar />, onClick: props.onToggleSidebar, shortcut: key('sidebar.toggle') },
    { id: 'theme.cycle', group: 'look', label: `${t('topbar.theme')}: ${props.theme.name}`, short: t('tool.theme'), detail: props.theme.name, icon: <IconTheme />, onClick: props.onCycleTheme, shortcut: key('theme.cycle') },
    { id: 'lang.toggle', group: 'look', label: `${t('topbar.language')} (${lang})`, short: t('tool.language'), detail: lang.toUpperCase(), icon: <IconLang />, onClick: props.onToggleLang, shortcut: key('lang.toggle') },
    { id: 'bar.toggle', group: 'look', label: t('topbar.hide'), short: t('tool.hideBar'), icon: <IconTopBar />, onClick: props.onHideTopBar, shortcut: key('bar.toggle'), testId: 'hide-bar' },
    { id: 'starters.toggle', group: 'look', label: t('tray.starters'), short: t('tool.starters'), icon: <IconSpark />, onClick: props.onToggleStarters, pressed: props.startersOn, testId: 'switch-starters' },
    { id: 'hints.toggle', group: 'look', label: t('tray.hints'), short: t('tool.hints'), icon: <IconHint />, onClick: props.onToggleHints, pressed: props.hintsOn, testId: 'switch-hints' },
    { id: 'session.export', group: 'session', label: t('firstRun.export'), short: t('tool.export'), icon: <IconDownload />, onClick: props.onExport, testId: 'export-session' },
    { id: 'session.import', group: 'session', label: t('import.label'), short: t('tool.import'), icon: <IconUpload />, onClick: props.onImport, testId: 'import-session' },
    {
      id: 'billing.topup',
      group: 'session',
      label: paymentsWired ? t('billing.topup') : t('billing.topupNotWired'),
      short: t('tool.topup'),
      detail: paymentsWired ? undefined : t('notWired'),
      icon: <IconKey />,
      onClick: () => void onTopUp(),
      testId: 'billing-topup',
    },
    { id: 'invite.redeem', group: 'session', label: t('invite.label'), short: t('tool.invite'), icon: <IconSpark />, onClick: () => void onInvite(), testId: 'invite-redeem' },
    { id: 'settings.open', group: 'session', label: t('topbar.settings'), short: t('tool.settings'), icon: <IconKey />, onClick: props.onSettings, shortcut: key('settings.open'), testId: 'settings-link' },
    { id: 'dev.toggle', group: 'session', label: t('topbar.devMode'), short: t('tool.dev'), icon: <IconDev />, onClick: props.onToggleDev, shortcut: key('dev.toggle'), pressed: props.devMode },
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
          <span className="version" data-testid="version">v{PRODUCT_VERSION}</span>
        </a>
      </Tooltip>
      {props.boxName ? <span className="tagline">/ {props.boxName}</span> : null}
      <span className="topbar-spacer" />
      <span className="balance" data-live={props.usedMicro > 0} data-testid="balance" aria-label={`${formatMicro(props.usedMicro)} ${t('topbar.used')}`}>
        {formatMicro(props.usedMicro)} {t('topbar.used')} · {t(props.payMode === 'own' ? 'pay.mode.own' : 'pay.mode.ours')}
      </span>
      <span className="topbar-group">
        <Tray
          tools={tools}
          pinned={props.pinned}
          onPinned={props.onPinned}
          nav={props.nav}
          onNavigate={props.onNavigate}
          links={[
            { label: t('footer.source'), href: REPO_URL },
            { label: t('footer.docs'), href: `${import.meta.env.BASE_URL}wiki/` },
          ]}
          foot={`v${PRODUCT_VERSION} · ${t('landing.tagline')}`}
        />
        <AccountButton />
      </span>
    </>
  );
}
