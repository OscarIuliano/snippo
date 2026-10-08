import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Error response in RFC 9457 (problem+json) format. */
export function problem(c: Context, status: ContentfulStatusCode, title: string, extra: Record<string, unknown> = {}) {
  return c.body(JSON.stringify({ type: "about:blank", title, status, ...extra }), status, {
    "Content-Type": "application/problem+json",
  });
}
