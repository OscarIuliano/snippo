import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { requestLocale, translate } from "./i18n";

/**
 * Error response in RFC 9457 (problem+json) format. The title is written in Italian and sent in the
 * language of the request; a "problems" list (checks of the questions) is translated the same way.
 */
export function problem(c: Context, status: ContentfulStatusCode, title: string, extra: Record<string, unknown> = {}) {
  const locale = requestLocale(c);
  const problems = Array.isArray(extra.problems)
    ? (extra.problems as { message: string }[]).map((p) => ({ ...p, message: translate(locale, p.message) }))
    : undefined;
  return c.body(JSON.stringify({ type: "about:blank", title: translate(locale, title), status, ...extra, ...(problems ? { problems } : {}) }), status, {
    "Content-Type": "application/problem+json",
  });
}
