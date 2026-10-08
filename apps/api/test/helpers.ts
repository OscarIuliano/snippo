import { exports } from "cloudflare:workers";
import { expect } from "vitest";
import type { ProjectDetail } from "@snippo/shared";

export const DASHBOARD = "http://localhost:5174";
export const SITE_ORIGIN = "https://trattoria-mario.it";
const PUBLIC_API = "https://api.snippo.test";

export type Api = (path: string, init?: RequestInit) => Promise<Response>;

/** Signs up a new user and returns a client for the dashboard API with their session cookie. */
export async function signUp(email: string): Promise<Api> {
  const res = await exports.default.fetch(`${DASHBOARD}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: DASHBOARD },
    body: JSON.stringify({ name: "Mario Rossi", email, password: "una-password-sicura" }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return (path, init = {}) =>
    exports.default.fetch(`${DASHBOARD}/api/v1${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: DASHBOARD, ...init.headers },
    });
}

export async function createProject(api: Api): Promise<string> {
  const res = await api("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Trattoria da Mario", template: "restaurant", domain: "https://www.trattoria-mario.it/menu" }),
  });
  expect(res.status).toBe(201);
  return (await res.json<{ id: string }>()).id;
}

/** Sends a valid restaurant booking through the public widget API, as a visitor would. */
export async function submitBooking(api: Api, projectId: string, overrides: Record<string, string> = {}): Promise<string> {
  const project = await (await api(`/projects/${projectId}`)).json<ProjectDetail>();
  const key = project.widget.publicKey;
  const config = await exports.default.fetch(`${PUBLIC_API}/v1/widget/config?key=${key}`, { headers: { Origin: SITE_ORIGIN } });
  const { flowVersionId } = await config.json<{ flowVersionId: string }>();
  const res = await exports.default.fetch(`${PUBLIC_API}/v1/widget/submissions?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: SITE_ORIGIN },
    body: JSON.stringify({
      flowVersionId,
      answers: { date: "2026-12-12", time: "20:30", party_size: "4", name: "Anna", phone: "+39 333 1112223", notes: "Un seggiolone", ...overrides },
      consent: true,
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json<{ id: string }>()).id;
}
