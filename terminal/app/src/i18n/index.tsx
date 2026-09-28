import { createContext, useContext, type ReactNode } from 'react';
import { translate, type Lang, type StringKey } from './strings';

interface I18nValue {
  lang: Lang;
  t: (key: StringKey, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nValue>({ lang: 'en', t: (key, vars) => translate('en', key, vars) });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value: I18nValue = { lang, t: (key, vars) => translate(lang, key, vars) };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export type { Lang, StringKey };
