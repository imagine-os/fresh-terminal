/**
 * Actions registry: every page declares its actions as {id, intent, permission}.
 * Exposed at window.__actions. This is the future WebMCP surface and the voice
 * controller's vocabulary (docs/reference/surfaces.md). Every UI change that
 * adds or removes a control updates this file.
 */
export type Permission = 'anyone' | 'owner' | 'dev';

export interface ActionDecl {
  id: string;
  /** Plain phrase a person (or voice controller) would say. */
  intent: string;
  permission: Permission;
  /** Single key when focus is outside the composer; Ctrl/Cmd+key inside it. */
  shortcut?: string;
  /** True when the control exists but does nothing yet. */
  notWired?: boolean;
}

export const SHELL_ACTIONS: ActionDecl[] = [
  { id: 'box.new', intent: 'new box', permission: 'anyone', shortcut: 'n' },
  { id: 'sidebar.toggle', intent: 'toggle sidebar', permission: 'anyone', shortcut: '[' },
  { id: 'theme.cycle', intent: 'next theme', permission: 'anyone', shortcut: 't' },
  { id: 'dev.toggle', intent: 'toggle dev mode', permission: 'anyone', shortcut: 'd' },
  { id: 'lang.toggle', intent: 'switch language', permission: 'anyone', shortcut: 'l' },
  { id: 'canvas.open', intent: 'open the master canvas', permission: 'anyone', shortcut: 'c' },
  { id: 'plan.open', intent: 'open the plan', permission: 'anyone' },
  { id: 'play.open', intent: 'replay this session step by step', permission: 'anyone', shortcut: 'p' },
  { id: 'tray.open', intent: 'open the tools tray', permission: 'anyone' },
  { id: 'tray.pin', intent: 'pin a tool to the top bar or send it back to the tray', permission: 'anyone' },
  { id: 'bar.toggle', intent: 'hide or show the top bar', permission: 'anyone', shortcut: 'h' },
  { id: 'session.export', intent: 'export this session as a file', permission: 'anyone' },
  { id: 'session.import', intent: 'import a session file as a new box', permission: 'anyone' },
  { id: 'play.branch', intent: 'branch the session from this step', permission: 'anyone', notWired: true },
  { id: 'edit.undo', intent: 'undo the last change', permission: 'anyone', shortcut: 'mod+z' },
  { id: 'edit.redo', intent: 'redo the change', permission: 'anyone', shortcut: 'mod+shift+z' },
  { id: 'nav.open', intent: 'open a sidebar menu item', permission: 'anyone' },
  { id: 'chip.edit', intent: 'change what a chip means', permission: 'anyone' },
  { id: 'skin.run', intent: 'skin a part of the app with a material ("skin the sidebar brass")', permission: 'anyone' },
  { id: 'skin.stop', intent: 'stop the skin refine loop and keep the best so far', permission: 'anyone' },
  { id: 'skin.pick', intent: 'use one of the skin versions from a round', permission: 'anyone' },
  { id: 'settings.open', intent: 'open settings (two ways to pay)', permission: 'anyone', shortcut: 'k' },
  { id: 'library.open', intent: 'browse the library of terminals', permission: 'anyone', shortcut: 'b' },
  { id: 'voice.toggle', intent: 'start or stop listening', permission: 'anyone', shortcut: 'v' },
  { id: 'voice.provider', intent: 'choose browser speech, OpenAI Realtime or Gemini Live', permission: 'anyone' },
  { id: 'voice.mute', intent: 'mute or unmute the assistant voice', permission: 'anyone' },
  { id: 'pay.mode', intent: 'use our key or bring your own key', permission: 'anyone' },
  { id: 'pay.key.delete', intent: 'delete my key from this browser', permission: 'anyone' },
  { id: 'auth.signIn', intent: 'sign in to keep my boxes on every device', permission: 'anyone' },
  { id: 'auth.signOut', intent: 'sign out', permission: 'anyone' },
  { id: 'sync.now', intent: 'sync my boxes now', permission: 'anyone' },
];

export const LANDING_ACTIONS: ActionDecl[] = [
  ...SHELL_ACTIONS,
  { id: 'composer.send', intent: 'send what I typed', permission: 'anyone' },
  { id: 'composer.speak', intent: 'start or stop listening', permission: 'anyone' },
  { id: 'composer.suggest', intent: 'use a suggested start', permission: 'anyone' },
];

export const BOX_ACTIONS: ActionDecl[] = [
  ...LANDING_ACTIONS,
  { id: 'box.open', intent: 'open a box', permission: 'anyone' },
];

/** Verbs answered locally from starters (docs/prompts/starters.json). */
export const STARTER_ACTIONS: ActionDecl[] = [
  { id: 'draw.composition', intent: 'draw a dashboard, login screen or kanban', permission: 'anyone' },
  { id: 'show.today', intent: 'show today', permission: 'anyone' },
  { id: 'make.box', intent: 'make a page called ...', permission: 'anyone' },
  { id: 'list.boxes', intent: 'list my boxes', permission: 'anyone' },
  { id: 'theme.switch', intent: 'switch to <theme>', permission: 'anyone' },
  { id: 'dialect.set', intent: 'set <region>: <behaviour> ...', permission: 'anyone' },
  { id: 'billing.rule', intent: 'charge me nothing for the next N calls', permission: 'owner', notWired: true },
  { id: 'chain.verify', intent: 'verify the chain', permission: 'anyone' },
  { id: 'speak', intent: 'speak: <text>', permission: 'anyone' },
  { id: 'lang.translate', intent: 'translate this box to Spanish', permission: 'anyone' },
];

export const DEV_ACTIONS: ActionDecl[] = [
  { id: 'dev.dialect.apply', intent: 'apply the shell dialect', permission: 'dev' },
  { id: 'dev.theme.pick', intent: 'pick a theme', permission: 'dev' },
  { id: 'dev.chain.verify', intent: 'verify the ledger chain', permission: 'dev' },
  { id: 'dev.chain.optIn', intent: 'go on chain', permission: 'dev' },
  { id: 'dev.ledger.export', intent: 'export the ledger', permission: 'dev' },
  { id: 'billing.settle', intent: 'settle the balance', permission: 'owner', notWired: true },
];

export const CANVAS_ACTIONS: ActionDecl[] = [
  ...SHELL_ACTIONS,
  { id: 'canvas.pan', intent: 'pan the canvas', permission: 'anyone', shortcut: 'arrows' },
  { id: 'canvas.zoom', intent: 'zoom the canvas', permission: 'anyone', shortcut: '+ / -' },
  { id: 'canvas.fit', intent: 'fit all cards', permission: 'anyone', shortcut: '0' },
  { id: 'canvas.card.move', intent: 'move the focused card', permission: 'anyone', shortcut: 'arrows' },
  { id: 'canvas.card.open', intent: 'open the card', permission: 'anyone' },
  { id: 'canvas.card.add', intent: 'add a card', permission: 'anyone' },
];

export const PAGE_ACTIONS: Record<string, ActionDecl[]> = {
  landing: [...LANDING_ACTIONS, ...STARTER_ACTIONS],
  box: [...BOX_ACTIONS, ...STARTER_ACTIONS],
  canvas: CANVAS_ACTIONS,
  dev: DEV_ACTIONS,
};

export function listActions(): ActionDecl[] {
  const seen = new Map<string, ActionDecl>();
  for (const actions of Object.values(PAGE_ACTIONS)) {
    for (const action of actions) {
      seen.set(action.id, action);
    }
  }
  return [...seen.values()];
}

export function shortcutFor(id: string): string | undefined {
  return listActions().find((action) => action.id === id)?.shortcut;
}

declare global {
  interface Window {
    __actions?: {
      pages: Record<string, ActionDecl[]>;
      list: () => ActionDecl[];
      version: number;
    };
  }
}

export function installActionsRegistry(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.__actions = { pages: PAGE_ACTIONS, list: listActions, version: 0 };
}
