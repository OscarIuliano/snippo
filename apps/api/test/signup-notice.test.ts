import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { DASHBOARD, PASSWORD, signUp } from "./helpers";

interface LoggedEmail {
  to: string;
  subject: string;
  text: string;
}

// No EMAIL binding in tests: sendEmail writes each email to the log, read back from there.
let logged: LoggedEmail[] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    const match = /^\n──── email → (\S+) ────\nOggetto: (.+)\n\n([\s\S]*)\n─+$/.exec(String(line));
    if (match) logged.push({ to: match[1]!, subject: match[2]!, text: match[3]! });
  });
});
afterEach(() => vi.restoreAllMocks());

const OWNER = "owner@example.com";

/** Signs up through the Worker with SIGNUP_NOTIFY_TO set or not (the test config leaves it unset). */
function signUpWith(notifyTo: string | undefined, name: string, email: string) {
  const request = new Request(`${DASHBOARD}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: DASHBOARD },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  });
  return worker.fetch(request, { ...env, SIGNUP_NOTIFY_TO: notifyTo }, createExecutionContext());
}

const userCount = async () => (await env.DB.prepare("SELECT count(*) AS n FROM users").first<{ n: number }>())!.n;

describe("Sign-up notice to the owner", () => {
  it("emails SIGNUP_NOTIFY_TO with the new account and the running total", async () => {
    await signUp("primo@example.com");
    const res = await signUpWith(OWNER, "Giulia Bianchi", "giulia@example.com");
    expect(res.status).toBe(200);

    const notices = logged.filter((e) => e.to === OWNER);
    expect(notices).toHaveLength(1);
    const notice = notices[0]!;
    expect(notice.subject).toContain("Nuova registrazione");
    expect(notice.subject).toContain("Giulia Bianchi");
    expect(notice.text).toContain("Email: giulia@example.com");
    expect(notice.text).toContain(`Account in totale: ${await userCount()}`);
    expect(await userCount()).toBeGreaterThanOrEqual(2);
    // The new user still gets the confirmation link.
    expect(logged.filter((e) => e.to === "giulia@example.com")).toHaveLength(1);
  });

  it("sends nothing to the owner without SIGNUP_NOTIFY_TO", async () => {
    const res = await signUpWith(undefined, "Paolo Verdi", "paolo@example.com");
    expect(res.status).toBe(200);
    expect(logged).toHaveLength(1);
    expect(logged[0]!.to).toBe("paolo@example.com");
  });

  it("does not block the sign-up when the notice fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // The binding sends the confirmation link and refuses the notice.
    const send = vi.fn(async (message: { to: string }) => {
      if (message.to === OWNER) throw new Error("send failed");
      return { messageId: "m1" };
    });
    const request = new Request(`${DASHBOARD}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: DASHBOARD },
      body: JSON.stringify({ name: "Rosa Gialli", email: "rosa@example.com", password: PASSWORD }),
    });
    const bindings = { ...env, SIGNUP_NOTIFY_TO: OWNER, EMAIL: { send } as unknown as SendEmail, EMAIL_FROM: "noreply@snippo.io" };
    const res = await worker.fetch(request, bindings, createExecutionContext());

    expect(res.status).toBe(200);
    expect(send.mock.calls.map(([m]) => m.to).sort()).toEqual([OWNER, "rosa@example.com"].sort());
    expect(error).toHaveBeenCalledWith("[signup notice]", expect.any(Error));
    expect(await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind("rosa@example.com").first()).not.toBeNull();
  });
});
