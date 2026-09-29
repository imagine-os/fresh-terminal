import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseDialect } from '@shared/dialect';
import { usedMicro } from '@shared/ledger';
import { THEME_SURFACE_PAGES, findTheme, nextThemeId, resolveThemeId } from '@shared/themes';
import { installActionsRegistry } from './actions/registry';
import { Canvas } from './canvas/Canvas';
import { DevPanel } from './dev/DevPanel';
import { PlanViewer } from './dev/PlanViewer';
import { I18nProvider, useI18n } from './i18n';
import { hrefFor, routeForPath, useRoute } from './lib/router';
import { PrefsProvider, usePrefs } from './prefs';
import { SettingsPanel } from './settings/SettingsPanel';
import { Shell } from './shell/Shell';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import type { SizeReadout } from './shell/useSizeClass';
import { store, useStoreSnapshot } from './store';
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
  const requested = route.name === 'box' ? snapshot.boxes.find((box) => box.id === route.id) ?? null : null;
  const currentBox = requested ?? mostRecent;

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
      set('themeId', resolution.id);
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

  const spec = useMemo(() => parseDialect(prefs.dialectText).spec, [prefs.dialectText]);
  const theme = useMemo(() => findTheme(prefs.themeId, snapshot.themes), [prefs.themeId, snapshot.themes]);
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
  const cycleTheme = useCallback(() => set('themeId', nextThemeId(prefs.themeId, snapshot.themes)), [prefs.themeId, snapshot.themes, set]);
  const toggleDev = useCallback(() => update({ devMode: !prefs.devMode }), [prefs.devMode, update]);
  const toggleLang = useCallback(() => set('lang', prefs.lang === 'en' ? 'es' : 'en'), [prefs.lang, set]);
  const openCanvas = useCallback(() => {
    navigate(route.name === 'canvas' ? { name: 'landing' } : { name: 'canvas' });
  }, [navigate, route.name]);

  // Shortcuts: single key outside the composer, Ctrl/Cmd+key inside it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey) {
        return;
      }
      const inEditor = isEditable(event.target);
      const modifier = event.ctrlKey || event.metaKey;
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
      else if (key === 'b') run(() => window.location.assign(`${import.meta.env.BASE_URL}pages/library.html`));
      else if (key === 'escape') {
        update({ leftOpen: false });
        setRightOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newBox, toggleSidebar, cycleTheme, toggleDev, toggleLang, openCanvas, update]);

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
          setTheme: (id) => set('themeId', id),
          setDialect: (text) => set('dialectText', text),
          setLang: (lang) => set('lang', lang),
          dialectText: prefs.dialectText,
          payMode: prefs.payMode,
          modelTagger: prefs.modelTagger,
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
      slots={{
        topBar: (
          <TopBar
            boxName={route.name === 'canvas' ? t('canvas.title') : route.name === 'plan' ? t('dev.pm') : landing ? '' : currentBox?.name ?? ''}
            theme={theme}
            devMode={prefs.devMode}
            usedMicro={used}
            showSave={snapshot.lines.length >= 3}
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
        leftSidebar: <Sidebar boxes={snapshot.boxes} currentId={currentBox?.id ?? null} onOpen={openBox} onNew={newBox} />,
        rightSidebar: prefs.devMode ? (
          <DevPanel
            dialectText={prefs.dialectText}
            onDialectChange={(text) => set('dialectText', text)}
            sizeClass={size.sizeClass}
            widthEm={size.widthEm}
            theme={theme}
            onPickTheme={(id) => set('themeId', id)}
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
      <WithLang />
    </PrefsProvider>
  );
}
