import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultSpecText } from '@shared/dialect';
import { DEFAULT_THEME_ID, findTheme } from '@shared/themes';
import type { Lang } from '../i18n/strings';
import { readJson, writeJson } from '../lib/storage';

const KEY = 'fresh-terminal.prefs';

export interface Prefs {
  themeId: string;
  lang: Lang;
  devMode: boolean;
  dialectText: string;
  leftOpen: boolean;
  /** 'ours' = our router and key (default); 'own' = the visitor's own OpenRouter key, browser-direct. */
  payMode: 'ours' | 'own';
  /** Dev toggle: also ask the router's tagger tier for chips on keystroke pause. */
  modelTagger: boolean;
  /** cached for the pre-paint script in index.html */
  bg?: string;
  fg?: string;
}

const defaults: Prefs = {
  themeId: DEFAULT_THEME_ID,
  lang: 'en',
  devMode: false,
  dialectText: defaultSpecText,
  leftOpen: false,
  payMode: 'ours',
  modelTagger: false,
};

interface PrefsValue {
  prefs: Prefs;
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  update: (patch: Partial<Prefs>) => void;
}

const PrefsContext = createContext<PrefsValue>({ prefs: defaults, set: () => {}, update: () => {} });

function loadPrefs(): Prefs {
  const saved = readJson<Partial<Prefs>>(KEY, {});
  const merged: Prefs = { ...defaults, ...saved };
  if (merged.lang !== 'en' && merged.lang !== 'es') {
    merged.lang = 'en';
  }
  return merged;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  useEffect(() => {
    const theme = findTheme(prefs.themeId);
    const toSave: Prefs = { ...prefs, bg: theme.tokens['--bg'], fg: theme.tokens['--fg'] };
    writeJson(KEY, toSave);
    document.documentElement.setAttribute('data-theme', theme.id);
    document.documentElement.setAttribute('lang', prefs.lang);
    document.documentElement.style.colorScheme = theme.scheme;
    document.documentElement.style.backgroundColor = theme.tokens['--bg'] ?? '';
  }, [prefs]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => ({ ...current, ...patch }));
  }, []);

  const set = useCallback(
    <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
      update({ [key]: value } as Partial<Prefs>);
    },
    [update],
  );

  const value = useMemo<PrefsValue>(() => ({ prefs, set, update }), [prefs, set, update]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  return useContext(PrefsContext);
}
