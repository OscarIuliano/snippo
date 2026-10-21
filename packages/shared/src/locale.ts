// Languages of the dashboard and of the account emails. Italian is the source and the default.

export const locales = ["it", "en"] as const;
export type Locale = (typeof locales)[number];
export const DEFAULT_LOCALE: Locale = "it";

export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale);

/** Locale for Intl formatters: dates and numbers as people of that language expect them. */
export const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "it-IT");

/** First supported language of an Accept-Language header, or the default. */
export function localeFromHeader(header: string | null | undefined): Locale {
  for (const part of (header ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

/** Replaces {name} placeholders: translate("Ciao {name}", { name }) works the same in every language. */
export function interpolate(text: string, params?: Record<string, string | number>): string {
  return params ? text.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match)) : text;
}
