import type { Context } from "hono";
import { interpolate, localeFromHeader, sharedEn } from "@snippo/shared";
import { apiEn } from "./messages-en";

const en: Record<string, string> = { ...sharedEn, ...apiEn };

/** Translates an Italian message into the language of the request (Italian when not English). */
export function translate(locale: "it" | "en", message: string, params?: Record<string, string | number>): string {
  return interpolate(locale === "en" ? (en[message] ?? message) : message, params);
}

export const requestLocale = (c: Context) => localeFromHeader(c.req.header("Accept-Language"));

