import { createExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { BOOKING_DATE } from "./helpers";
import { ALLOWED_ORIGIN, FLOW_VERSION_ID, PUBLIC_KEY, seed } from "./seed";

const SUBMIT_URL = `https://api.snippo.test/v1/widget/submissions?key=${PUBLIC_KEY}`;

function submission(extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request(SUBMIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN, ...headers },
    body: JSON.stringify({
      flowVersionId: FLOW_VERSION_ID,
      answers: { date: BOOKING_DATE, time: "20:30", party_size: "2", name: "Rita", phone: "+39 333 4445556" },
      consent: true,
      ...extra,
    }),
  });
}

beforeEach(seed);
afterEach(() => vi.restoreAllMocks());

describe("Turnstile", () => {
  it("tells the widget where the check runs", async () => {
    const res = await exports.default.fetch(`https://api.snippo.test/v1/widget/config?key=${PUBLIC_KEY}`, { headers: { Origin: ALLOWED_ORIGIN } });
    const config = await res.json<{ challenge?: { url: string; siteKey: string } }>();
    expect(config.challenge).toEqual({ url: env.CHALLENGE_URL, siteKey: env.TURNSTILE_SITE_KEY });
  });

  it("requires a token Cloudflare accepts, when a secret is configured", async () => {
    const siteverify = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = init?.body as FormData;
      return Response.json({ success: body.get("secret") === "turnstile-secret" && body.get("response") === "good-token" });
    });
    const withTurnstile = { ...env, TURNSTILE_SECRET: "turnstile-secret" };
    const send = (extra: Record<string, unknown>) => worker.fetch(submission(extra), withTurnstile, createExecutionContext());

    expect((await send({})).status).toBe(403);
    expect((await send({ turnstileToken: "forged" })).status).toBe(403);
    expect((await send({ turnstileToken: "good-token" })).status).toBe(201);
    expect(siteverify).toHaveBeenCalledTimes(2); // no token = no call to Cloudflare
  });

  it("accepts a retried submission without a new token", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ success: true }));
    const withTurnstile = { ...env, TURNSTILE_SECRET: "turnstile-secret" };
    const headers = { "Idempotency-Key": "antispam-retry" };

    const first = await worker.fetch(submission({ turnstileToken: "good-token" }, headers), withTurnstile, createExecutionContext());
    const retry = await worker.fetch(submission({}, headers), withTurnstile, createExecutionContext());
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
  });
});

describe("rate limit", () => {
  it("stops a visitor after 10 submissions a minute on the same widget", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await exports.default.fetch(submission({}, { "CF-Connecting-IP": "203.0.113.7" }))).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);

    // Another visitor is not affected.
    expect((await exports.default.fetch(submission({}, { "CF-Connecting-IP": "203.0.113.8" }))).status).toBe(201);
  });
});
