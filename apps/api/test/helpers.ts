import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";
import { addDays, type ProjectDetail } from "@snippo/shared";
import { nowIn } from "../src/availability";

export const DASHBOARD = "http://localhost:5174";
export const SITE_ORIGIN = "https://trattoria-mario.it";
export const PUBLIC_API = "https://api.snippo.test";

/** Dates relative to today (Europe/Rome), so the tests never fall into the past. */
export const TODAY = nowIn("Europe/Rome").date;
export const inDays = (n: number) => addDays(TODAY, n);
/** The default booking date of submitBooking. */
export const BOOKING_DATE = inDays(30);

export type Api = (path: string, init?: RequestInit) => Promise<Response>;

export const PASSWORD = "una-password-sicura";

export function authPost(path: string, body: unknown, cookie?: string): Promise<Response> {
  return exports.default.fetch(`${DASHBOARD}/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: DASHBOARD, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

export const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

/**
 * Signs up a new user and returns a client for the dashboard API with their session cookie.
 * The address is marked as confirmed directly in the database (the email flow has its own tests).
 */
export async function signUp(email: string): Promise<Api> {
  expect((await authPost("/sign-up/email", { name: "Mario Rossi", email, password: PASSWORD })).status).toBe(200);
  await env.DB.prepare("UPDATE users SET email_verified = 1 WHERE email = ?").bind(email).run();
  const res = await authPost("/sign-in/email", { email, password: PASSWORD });
  expect(res.status).toBe(200);
  return apiWithCookie(cookiesOf(res));
}

export function apiWithCookie(cookie: string): Api {
  // "/projects/…" is relative to /api/v1; a path starting with /api/ is used as it is.
  return (path, init = {}) =>
    exports.default.fetch(`${DASHBOARD}${path.startsWith("/api/") ? path : `/api/v1${path}`}`, {
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
      answers: { date: BOOKING_DATE, time: "20:30", party_size: "4", name: "Anna", phone: "+39 333 1112223", notes: "Un seggiolone", ...overrides },
      consent: true,
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json<{ id: string }>()).id;
}

/** Invites a new user as operator of the owner's organization and returns their client. */
export async function inviteOperator(owner: Api, email: string): Promise<Api> {
  const res = await owner("/team/invitations", { method: "POST", body: JSON.stringify({ role: "operator" }) });
  const token = (await res.json<{ url: string }>()).url.split("/invito/")[1];
  const operator = await signUp(email);
  await operator(`/api/invitations/${token}/accept`, { method: "POST" });
  return operator;
}
