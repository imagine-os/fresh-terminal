import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultSpecText, parseDialect } from '@shared/dialect';
import type { Op } from '@shared/ops';
import type { NavTarget } from '@shared/ui';
import { usedMicro } from '@shared/ledger';
import { THEME_SURFACE_PAGES, findTheme, nextThemeId, resolveThemeId } from '@shared/themes';
import { installActionsRegistry } from './actions/registry';
import { AccountProvider } from './auth/Account';
import { Canvas } from './canvas/Canvas';
import { DevPanel } from './dev/DevPanel';
import { PlanViewer } from './dev/PlanViewer';
import { I18nProvider, useI18n } from './i18n';
import { hrefFor, routeForPath, useRoute } from './lib/router';
import { probeRouter } from './lib/routerHealth';
import { PrefsProvider, usePrefs } from './prefs';
import { SettingsPanel } from './settings/SettingsPanel';
import type { RealtimeProviderInfo } from './voice';
import { Shell } from './shell/Shell';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import type { SizeReadout } from './shell/useSizeClass';
import { store, useStoreSnapshot, type EditSource } from './store';
import { PageView } from './pages/PageView';
import { BoxView } from './terminal/BoxView';
import { ToastProvider, useToast } from './ui/Toast';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || target.isContentEditable;
}

function Product() {
  const { prefs, set, update } = usePrefs();
  const { t } = useI18n();
  const { toast } = useToast();
  const snapshot = useStoreSnapshot();
  const [route, navigate] = useRoute();
  const [size, setSize] = useState<SizeReadout>({ sizeClass: 'laptop', widthEm: 80, widthPx: 1280 });
  const [rightOpen, setRightOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [realtimeProviders, setRealtimeProviders] = useState<RealtimeProviderInfo[] | null>(null);
  const [routerOk, setRouterOk] = useState<boolean | null>(null);

  // Probe the router once on load (3 s timeout); learn which voice providers it can mint.
  useEffect(() => {
    let cancelled = false;
    void probeRouter().then(async (health) => {
      if (cancelled) {
        return;
      }
      setRouterOk(health.state === 'ok');
      if (health.state !== 'ok') {
        setRealtimeProviders([]);
        return;
      }
      try {
        const response = await fetch(`${health.url}/realtime/providers`);
        const body = (await response.json()) as { providers: RealtimeProviderInfo[] };
        if (!cancelled) {
          setRealtimeProviders(body.providers);
        }
      } catch {
        if (!cancelled) {
          setRealtimeProviders([]);
        }
      }
    });
    const onOpenSettings = () => setSettingsOpen(true);
    window.addEventListener('ft:open-settings', onOpenSettings);
    return () => {
      cancelled = true;
      window.removeEventListener('ft:open-settings', onOpenSettings);
    };
  }, []);

  useEffect(() => {
    installActionsRegistry();
  }, []);

  // First visit: create the visitor's first box. Landing shows the most recent box.
  useEffect(() => {
    if (snapshot.boxes.length === 0) {
      store.createBox(t('box.default'));
    }
  }, [snapshot.boxes.length, t]);

  const mostRecent = useMemo(
    () => [...snapshot.boxes].sort((a, b) => b.updated_at - a.updated_at)[0] ?? null,
    [snapshot.boxes],
  );
  const currentPage = route.name === 'page' ? snapshot.pages.find((page) => page.id === route.id) ?? null : null;
  const requested =
    route.name === 'box'
      ? snapshot.boxes.find((box) => box.id === route.id) ?? null
      : currentPage
        ? snapshot.boxes.find((box) => box.id === currentPage.box_id) ?? null
        : null;
  const currentBox = requested ?? mostRecent;
  const boxUi = useMemo(
    () => (currentBox ? snapshot.boxUis.find((ui) => ui.box_id === currentBox.id) ?? null : null),
    [currentBox, snapshot.boxUis],
  );
  const effectiveThemeId = boxUi?.theme_id ?? prefs.themeId;
  const dialectText = boxUi?.dialect_text ?? defaultSpecText;

  /** Every interface change goes through the op engine (atomic, undoable). */
  const edit = useCallback(
    (ops: Op[], source: EditSource) => {
      if (!currentBox) return null;
      const result = store.applyOps(currentBox.id, ops, source);
      if (!result.ok) toast(result.reason);
      return result;
    },
    [currentBox, toast],
  );

  // An unknown /box/:id (another browser's box, a typo) falls back to the
  // visitor's most recent box and repairs the URL without a history entry.
  useEffect(() => {
    if (route.name === 'box' && requested === null && mostRecent !== null) {
      window.history.replaceState(null, '', hrefFor({ name: 'box', id: mostRecent.id }));
    }
  }, [route, requested, mostRecent]);

  // /box/new?theme=<id>: new box with that theme (or the closest built one), then focus the composer.
  useEffect(() => {
    if (route.name !== 'new-box') {
      return;
    }
    const surfacePage = route.theme ? THEME_SURFACE_PAGES[route.theme.toLowerCase()] : undefined;
    if (surfacePage !== undefined) {
      // A whole-page surface (koi pond) until it becomes an in-app theme in pass 3.
      window.location.replace(`${import.meta.env.BASE_URL}${surfacePage}`);
      return;
    }
    const created = store.createBox(`${t('box.untitled')} ${snapshot.boxes.length + 1}`);
    if (route.theme) {
      const resolution = resolveThemeId(route.theme, snapshot.themes);
      store.applyOps(created.id, [{ op: 'theme.set', theme_id: resolution.id }], 'system');
      const name = findTheme(resolution.id, snapshot.themes).name;
      if (!resolution.built) {
        toast(t('theme.notBuilt', { name: route.theme, fallback: name }));
      }
      store.appendLine(created.id, 'system', t('system.newBoxTheme', { name }), [], { reveal: 'none' });
    } else {
      store.appendLine(created.id, 'system', t('system.newBox'), [], { reveal: 'none' });
    }
    window.history.replaceState(null, '', hrefFor({ name: 'box', id: created.id }));
    navigate({ name: 'box', id: created.id });
    // runs once per arrival at /box/new
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.name]);

  const spec = useMemo(() => parseDialect(dialectText).spec, [dialectText]);
  const theme = useMemo(() => findTheme(effectiveThemeId, snapshot.themes), [effectiveThemeId, snapshot.themes]);
  const used = useMemo(
    () => usedMicro(snapshot.entries.filter((entry) => entry.owner_identity === store.identity)),
    [snapshot.entries],
  );

  const newBox = useCallback(() => {
    const created = store.createBox(`${t('box.untitled')} ${snapshot.boxes.length + 1}`);
    store.appendLine(created.id, 'system', t('system.newBox'), []);
    navigate({ name: 'box', id: created.id });
  }, [snapshot.boxes.length, navigate, t]);

  const openBox = useCallback(
    (id: string) => {
      navigate({ name: 'box', id });
      set('leftOpen', false);
    },
    [navigate, set],
  );

  const toggleSidebar = useCallback(() => set('leftOpen', !prefs.leftOpen), [prefs.leftOpen, set]);
  const cycleTheme = useCallback(
    () => edit([{ op: 'theme.set', theme_id: nextThemeId(effectiveThemeId, snapshot.themes) }], 'shortcut'),
    [edit, effectiveThemeId, snapshot.themes],
  );
  const toggleDev = useCallback(() => update({ devMode: !prefs.devMode }), [prefs.devMode, update]);
  const toggleLang = useCallback(() => set('lang', prefs.lang === 'en' ? 'es' : 'en'), [prefs.lang, set]);
  const openCanvas = useCallback(() => {
    navigate(route.name === 'canvas' ? { name: 'landing' } : { name: 'canvas' });
  }, [navigate, route.name]);

  const openPage = useCallback((pageId: string) => navigate({ name: 'page', id: pageId }), [navigate]);

  /** Undo the newest applied batch in this box; redo the most recently undone one. */
  const undoLast = useCallback(() => {
    if (!currentBox) return;
    const batch = [...store.getSnapshot().edits]
      .filter((candidate) => candidate.box_id === currentBox.id && candidate.state === 'applied')
      .sort((a, b) => (b.flipped_at ?? b.created_at) - (a.flipped_at ?? a.created_at))[0];
    if (!batch) return;
    const result = store.undo(batch.id);
    toast(result.ok ? `${t('edits.undone')}: ${batch.summary.replace(/^Edited: /, '')}` : result.reason);
  }, [currentBox, toast, t]);
  const redoLast = useCallback(() => {
    if (!currentBox) return;
    const batch = [...store.getSnapshot().edits]
      .filter((candidate) => candidate.box_id === currentBox.id && candidate.state === 'undone')
      .sort((a, b) => (b.flipped_at ?? 0) - (a.flipped_at ?? 0))[0];
    if (!batch) return;
    const result = store.redo(batch.id);
    toast(result.ok ? result.batch.summary : result.reason);
  }, [currentBox, toast]);

  const navigateTo = useCallback(
    (target: NavTarget) => {
      if (target.kind === 'box') {
        openBox(target.ref);
      } else if (target.kind === 'page') {
        const page =
          snapshot.pages.find((candidate) => candidate.id === target.ref) ??
          snapshot.pages.find((candidate) => candidate.box_id === currentBox?.id && candidate.title.toLowerCase() === target.ref.toLowerCase());
        if (page) {
          navigate({ name: 'page', id: page.id });
          set('leftOpen', false);
        } else {
          toast(t('page.missing'));
        }
      } else if (target.kind === 'url') {
        const absolute = /^https?:\/\//i.test(target.ref);
        window.location.assign(absolute ? target.ref : `${import.meta.env.BASE_URL}${target.ref.replace(/^\//, '')}`);
      } else {
        window.dispatchEvent(new CustomEvent('ft:action', { detail: { id: target.ref } }));
      }
    },
    [openBox, snapshot.pages, currentBox, navigate, set, toast, t],
  );

  // Actions from nav items, page buttons and reply rows: one runner.
  useEffect(() => {
    const runners: Record<string, () => void> = {
      'canvas.open': () => navigate({ name: 'canvas' }),
      'plan.open': () => navigate({ name: 'plan' }),
      'library.open': () => window.location.assign(`${import.meta.env.BASE_URL}pages/library.html`),
      'settings.open': () => setSettingsOpen(true),
      'box.new': () => newBox(),
      'theme.cycle': () => cycleTheme(),
      'dev.toggle': () => toggleDev(),
      'lang.toggle': () => toggleLang(),
      'sidebar.toggle': () => toggleSidebar(),
      'edit.undo': () => undoLast(),
      'edit.redo': () => redoLast(),
    };
    const onAction = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id ?? '';
      const runner = runners[id];
      if (runner) runner();
      else toast(t('notWired'));
    };
    window.addEventListener('ft:action', onAction);
    return () => window.removeEventListener('ft:action', onAction);
  }, [navigate, newBox, cycleTheme, toggleDev, toggleLang, toggleSidebar, undoLast, redoLast, toast, t]);

  // Shortcuts: single key outside the composer, Ctrl/Cmd+key inside it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey) {
        return;
      }
      const inEditor = isEditable(event.target);
      const modifier = event.ctrlKey || event.metaKey;
      // Ctrl/Cmd+Z undoes the last interface edit (outside fields, or in an empty composer).
      if (modifier && event.key.toLowerCase() === 'z') {
        const target = event.target;
        const empty = !inEditor || ((target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) && target.value === '');
        if (empty) {
          event.preventDefault();
          if (event.shiftKey) redoLast();
          else undoLast();
        }
        return;
      }
      if (inEditor && !modifier) {
        if (event.key === 'Escape') {
          update({ leftOpen: false });
          setRightOpen(false);
        }
        return;
      }
      if (!inEditor && modifier) {
        return;
      }
      const key = event.key.toLowerCase();
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };
      if (key === 'n') run(newBox);
      else if (key === '[') run(toggleSidebar);
      else if (key === 't') run(cycleTheme);
      else if (key === 'd') run(toggleDev);
      else if (key === 'l') run(toggleLang);
      else if (key === 'c') run(openCanvas);
      else if (key === 'k') run(() => setSettingsOpen((current) => !current));
      else if (key === 'v') run(() => window.dispatchEvent(new CustomEvent('ft:voice-toggle')));
      else if (key === 'b') run(() => window.location.assign(`${import.meta.env.BASE_URL}pages/library.html`));
      else if (key === 'escape') {
        update({ leftOpen: false });
        setRightOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newBox, toggleSidebar, cycleTheme, toggleDev, toggleLang, openCanvas, update, undoLast, redoLast]);

  const closeFloating = useCallback(() => {
    update({ leftOpen: false });
    setRightOpen(false);
  }, [update]);

  const landing = route.name === 'landing';

  let stage: React.ReactNode = null;
  if (route.name === 'canvas') {
    stage = <Canvas onOpenRoute={(path) => navigate(routeForPath(path))} onOpenBox={openBox} />;
  } else if (route.name === 'plan') {
    stage = (
      <div className="dev" style={{ padding: 0 }}>
        <PlanViewer />
      </div>
    );
  } else if (route.name === 'page') {
    stage = <PageView pageId={route.id} />;
  } else if (currentBox) {
    stage = (
      <BoxView
        key={currentBox.id}
        box={currentBox}
        theme={theme}
        landing={landing}
        showNewBoxDoodle={snapshot.boxes.length === 1}
        onOpenBox={openBox}
        commands={{
          setLang: (lang) => set('lang', lang),
          dialectText,
          effectiveThemeId,
          openPage,
          payMode: prefs.payMode,
          modelTagger: prefs.modelTagger,
          voiceProvider: prefs.voiceProvider,
          voiceMode: prefs.voiceMode,
          openSettings: () => setSettingsOpen(true),
          realtimePrice: (provider) => realtimeProviders?.find((info) => info.id === provider)?.price ?? null,
        }}
      />
    );
  }

  return (
    <Shell
      spec={spec}
      theme={theme}
      devMode={prefs.devMode}
      leftOpen={prefs.leftOpen}
      rightOpen={rightOpen}
      onCloseFloating={closeFloating}
      onSize={setSize}
      styleOverrides={boxUi?.style}
      skins={boxUi?.skins}
      slots={{
        topBar: (
          <TopBar
            boxName={route.name === 'canvas' ? t('canvas.title') : route.name === 'plan' ? t('dev.pm') : route.name === 'page' ? currentPage?.title ?? '' : landing ? '' : currentBox?.name ?? ''}
            theme={theme}
            devMode={prefs.devMode}
            usedMicro={used}
            onNewBox={newBox}
            onToggleSidebar={toggleSidebar}
            onCycleTheme={cycleTheme}
            onToggleDev={toggleDev}
            onToggleLang={toggleLang}
            onHome={() => navigate({ name: 'landing' })}
            onCanvas={openCanvas}
            canvasActive={route.name === 'canvas'}
            onSettings={() => setSettingsOpen((current) => !current)}
            payMode={prefs.payMode}
            libraryHref={`${import.meta.env.BASE_URL}pages/library.html`}
          />
        ),
        leftSidebar: <Sidebar boxes={snapshot.boxes} currentId={currentBox?.id ?? null} onOpen={openBox} onNew={newBox} onNavigate={navigateTo} />,
        rightSidebar: prefs.devMode ? (
          <DevPanel
            dialectText={dialectText}
            onDialectChange={(text) => currentBox && store.setBoxDialect(currentBox.id, text)}
            sizeClass={size.sizeClass}
            widthEm={size.widthEm}
            theme={theme}
            onPickTheme={(id) => edit([{ op: 'theme.set', theme_id: id }], 'shortcut')}
            modelTagger={prefs.modelTagger}
            onModelTagger={(enabled) => set('modelTagger', enabled)}
          />
        ) : null,
        stage: (
          <>
            {stage}
            <SettingsPanel
              open={settingsOpen}
              payMode={prefs.payMode}
              onPayMode={(mode) => set('payMode', mode)}
              onClose={() => setSettingsOpen(false)}
              voiceProvider={prefs.voiceProvider}
              onVoiceProvider={(id) => set('voiceProvider', id)}
              voiceMode={prefs.voiceMode}
              onVoiceMode={(mode) => set('voiceMode', mode)}
              realtimeProviders={realtimeProviders}
              routerOk={routerOk}
            />
          </>
        ),
        bottomBar: <div id="composer-slot" />,
      }}
    />
  );
}

function WithLang() {
  const { prefs } = usePrefs();
  return (
    <I18nProvider lang={prefs.lang}>
      <ToastProvider>
        <Product />
      </ToastProvider>
    </I18nProvider>
  );
}

export default function App() {
  return (
    <PrefsProvider>
      <AccountProvider>
        <WithLang />
      </AccountProvider>
    </PrefsProvider>
  );
}
