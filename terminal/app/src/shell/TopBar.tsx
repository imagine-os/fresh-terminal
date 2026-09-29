import { PRODUCT_NAME, PRODUCT_VERSION, REPO_URL } from '@shared/brand';
import { formatMicro } from '@shared/ledger';
import { useCredits } from '../credits/useCredits';
import { formatMoney, type Currency } from '../lib/currency';
import type { Theme } from '@shared/themes';
import type { NavItem, NavTarget } from '@shared/ui';
import { shortcutFor } from '../actions/registry';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { IconDev, IconDownload, IconKey, IconLang, IconList, IconMic, IconPlus, IconReplay, IconSidebar, IconSpark, IconUpload } from '../ui/icons';
import { redeemInviteCode, startTopUp } from '../credits/billing';
import { useToast } from '../ui/Toast';
import { AccountButton } from './AccountButton';
import { useAccount } from '../auth/Account';
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
  /** The $ used counter's reading currency (C-090). */
  currency: Currency;
  onCycleCurrency: () => void;
  /** Terminal-talk: the terminal speaks back. A switch and a demo for now. */
  talkOn: boolean;
  onToggleTalk: () => void;
  onActions: () => void;
  onPlan: () => void;
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
  const grantedMicro = credits.status?.granted_micro ?? 5_000_000;
  // Fewer tools, one list (C-090): Look is gone, Library and Canvas live on their own pages.
  const { toast } = useToast();
  // C-086: wired only when the router says a payment provider is connected.
  const paymentsWired = credits.status?.billing?.provider === 'stripe' || credits.status?.billing?.provider === 'clerk';
  const onTopUp = async () => {
    if (!account.signedIn) {
      toast(t('billing.signInFirst'));
      return;
    }
    const result = await startTopUp();
    if (result.kind === 'redirect') {
      toast(t('billing.opening'));
      window.location.assign(result.url);
    } else if (result.kind === 'clerk') window.dispatchEvent(new CustomEvent('ft:action', { detail: { id: 'billing.open' } }));
    else if (result.kind === 'not-wired') toast(t('billing.notWired'));
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
    { id: 'actions.open', group: 'go', label: t('topbar.actions'), short: t('tool.actions'), icon: <IconList />, onClick: props.onActions, testId: 'actions-link' },
    { id: 'play.open', group: 'go', label: t('topbar.replay'), short: t('tool.replay'), icon: <IconReplay />, onClick: props.onReplay, shortcut: key('play.open'), pressed: props.replayActive, testId: 'replay-link' },
    { id: 'lang.toggle', group: 'session', label: `${t('topbar.language')} (${lang})`, short: t('tool.language'), detail: lang.toUpperCase(), icon: <IconLang />, onClick: props.onToggleLang, shortcut: key('lang.toggle') },
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
    { id: 'talk.toggle', group: 'session', label: t('tray.talk'), short: t('tray.talk'), detail: t('tray.talkSoon'), icon: <IconMic />, onClick: props.onToggleTalk, pressed: props.talkOn, testId: 'talk-toggle' },
    { id: 'dev.toggle', group: 'session', label: t('topbar.devMode'), short: t('tool.dev'), icon: <IconDev />, onClick: props.onToggleDev, shortcut: key('dev.toggle'), pressed: props.devMode },
    ...(props.devMode ? [{ id: 'plan.open', group: 'session' as const, label: t('tray.plan'), short: t('tray.plan'), icon: <IconList />, onClick: props.onPlan }] : []),
  ];
  return (
    <>
      <Tooltip label={t('topbar.boxes')} shortcut={key('sidebar.toggle')} align="start">
        <Button icon variant="ghost" className="boxes-toggle" aria-label={t('topbar.boxes')} onClick={props.onToggleSidebar} data-testid="boxes-toggle">
          <IconSidebar />
        </Button>
      </Tooltip>
      <Tooltip label={t('topbar.version.tip', { version: PRODUCT_VERSION })} align="start">
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
      {props.boxName ? <span className="tagline">/ {props.boxName}</span> : null}
      <span className="topbar-spacer" />
      {/* Where your work lives, one line, top center (C-085). */}
      <span className="topbar-note" data-testid="topbar-note">
        {account.signedIn ? (
          t('topbar.savedCloud')
        ) : (
          <>
            <b>{t('topbar.saved')}</b>{' '}
            <button type="button" className="topbar-note-link" onClick={account.signIn} disabled={!account.loaded}>
              {t('topbar.signInToSave')}
            </button>
          </>
        )}
      </span>
      <span className="balance" data-live={props.usedMicro > 0} data-testid="balance">
        <Tooltip label={t('topbar.used.tip', { total: formatMicro(grantedMicro, 2) })} align="end">
          <button type="button" className="balance-used" onClick={props.onCycleCurrency} aria-label={`${formatMoney(props.usedMicro, props.currency)} ${t('topbar.used')}`} data-testid="balance-used">
            {formatMoney(props.usedMicro, props.currency)} {t('topbar.used')}
          </button>
        </Tooltip>
        <span aria-hidden="true"> · </span>
        <Tooltip label={props.payMode === 'own' ? t('pay.mode.own') : t('topbar.free.tip')} align="end">
          <span className="balance-mode">{t(props.payMode === 'own' ? 'pay.mode.own' : 'pay.mode.ours')}</span>
        </Tooltip>
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
