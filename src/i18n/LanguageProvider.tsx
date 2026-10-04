"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_LANG, translations, type Dictionary, type Lang } from "./translations";

/**
 * The site ships in English only. This provider exists so components can keep
 * reading copy through a single `useLanguage()` call - `lang` is a constant, so
 * there is no stored preference, no switcher and nothing to hydrate.
 */
interface LanguageContextValue {
  lang: Lang;
  /** Active dictionary. */
  t: Dictionary;
}

const VALUE: LanguageContextValue = {
  lang: DEFAULT_LANG,
  t: translations[DEFAULT_LANG],
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  return (
    <LanguageContext.Provider value={VALUE}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside <LanguageProvider>");
  }
  return ctx;
}
