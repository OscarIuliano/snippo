import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, interpolate, intlLocale, isLocale, sharedEn, type Locale } from "@snippo/shared";
import { en } from "./en";

// Italian is written in the code, t("Richieste"); en.ts gives the English. scripts/check-i18n.mjs
// fails when a text passed to t() has no English, so nothing shows up half translated.

const english: Record<string, string> = { ...sharedEn, ...en };
const STORAGE_KEY = "snippo:locale";

/** Marks a text defined outside a component, translated later with t(): msg("Richieste"). */
export const msg = (text: string) => text;

export type Translate = (text: string, params?: Record<string, string | number>) => string;

export function translate(locale: Locale, text: string, params?: Record<string, string | number>): string {
  if (locale === "it") return interpolate(text, params);
  const found = english[text];
  if (found === undefined && import.meta.env.DEV) console.warn(`[i18n] missing English for: ${text}`);
  return interpolate(found ?? text, params);
}

/** The language of this browser before sign-in: the last one chosen here, else Italian. */
export function storedLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function remember(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage blocked: the language lasts until the page is reloaded.
  }
}

/** Read by lib/api.ts for Accept-Language: the API answers errors in this language. */
let currentLocale: Locale = storedLocale();
export const activeLocale = () => currentLocale;

interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
  /** "it-IT" or "en-GB", for Intl formatters. */
  intl: string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(currentLocale);

  const setLocale = useCallback((next: Locale) => {
    currentLocale = next;
    remember(next);
    setLocaleState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18n>(() => ({ locale, setLocale, t: (text, params) => translate(locale, text, params), intl: intlLocale(locale) }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n outside I18nProvider");
  return value;
}

/**
 * Puts elements into a translated text: fill(t(text), { email: <strong>…</strong> }) for a "{email}" in it.
 * The placeholders stay in the translation, so each language can move them where it needs.
 */
export function fill(text: string, nodes: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{key && key in nodes ? nodes[key] : part}</Fragment>;
  });
}

/** Shorthand for the components that only need t. */
export const useT = () => useI18n().t;

/** Intl formatters for the current language, created once per language. */
export function useFormat<T>(create: (intl: string) => T): T {
  const { intl } = useI18n();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => create(intl), [intl]);
}
