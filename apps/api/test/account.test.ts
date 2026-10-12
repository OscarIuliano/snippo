import { exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD, PASSWORD, apiWithCookie, authPost, cookiesOf, signUp } from "./helpers";

interface SentEmail {
  to: string;
  subject: string;
  /** The first link in the email: the action button. */
  url: string;
}

// Without RESEND_API_KEY every email goes to the log: the tests read it from there.
let sent: SentEmail[] = [];
beforeEach(() => {
  sent = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    const match = /^\n──── email → (\S+) ────\nOggetto: (.+)\n/.exec(String(line));
    if (match) sent.push({ to: match[1]!, subject: match[2]!, url: /https?:\/\/\S+/.exec(String(line).slice(match[0].length))?.[0] ?? "" });
  });
});
afterEach(() => vi.restoreAllMocks());

const lastEmailTo = (to: string) => sent.filter((e) => e.to === to).at(-1);
const signIn = (email: string, password = PASSWORD) => authPost("/sign-in/email", { email, password });
/** Opens a link from an email as the browser would, without following the redirect. */
const open = (url: string) => exports.default.fetch(url, { redirect: "manual" });

describe("Registration with email confirmation", () => {
  it("sends the link, refuses to sign in before it is used, and signs in after", async () => {
    const email = "nuovo@example.com";
    const signup = await authPost("/sign-up/email", { name: "Lucia Neri", email, password: PASSWORD, callbackURL: "/" });
    expect(signup.status).toBe(200);
    expect(cookiesOf(signup)).not.toMatch(/session_token=\w/);

    const message = lastEmailTo(email);
    expect(message?.subject).toBe("Conferma il tuo indirizzo email");
    expect(message!.url.startsWith(`${DASHBOARD}/api/auth/verify-email?token=`)).toBe(true);

    const before = await signIn(email);
    expect(before.status).toBe(403);
    // The attempt sends a fresh link, for someone who lost the first one.
    expect(sent.filter((e) => e.to === email)).toHaveLength(2);

    const verified = await open(message!.url);
    expect(verified.status).toBe(302);
    expect(verified.headers.get("Location")).toBe("/");
    const me = await apiWithCookie(cookiesOf(verified))("/me");
    expect(me.status).toBe(200);

    expect((await signIn(email)).status).toBe(200);
  });
});

describe("Forgotten password", () => {
  it("resets the password from the emailed link and signs out the old sessions", async () => {
    const email = "smemorato@example.com";
    const oldSession = await signUp(email);

    const request = await authPost("/request-password-reset", { email, redirectTo: `${DASHBOARD}/reimposta-password` });
    expect(request.status).toBe(200);
    const message = lastEmailTo(email);
    expect(message?.subject).toBe("Reimposta la password di Snippo");

    // The link checks the token, then sends the browser to the dashboard page with it.
    const link = await open(message!.url);
    expect(link.status).toBe(302);
    const location = new URL(link.headers.get("Location")!);
    expect(`${location.origin}${location.pathname}`).toBe(`${DASHBOARD}/reimposta-password`);
    const token = location.searchParams.get("token")!;

    expect((await authPost("/reset-password", { token, newPassword: "una-password-nuova" })).status).toBe(200);
    expect(lastEmailTo(email)?.subject).toBe("La password di Snippo è cambiata");
    expect((await signIn(email)).status).toBe(401);
    expect((await signIn(email, "una-password-nuova")).status).toBe(200);
    expect((await oldSession("/me")).status).toBe(401);

    // Used once: the same token does not work again.
    expect((await authPost("/reset-password", { token, newPassword: "un-altra-password" })).status).toBe(400);
  });

  it("answers the same way for an address with no account", async () => {
    const res = await authPost("/request-password-reset", { email: "nessuno@example.com", redirectTo: `${DASHBOARD}/reimposta-password` });
    expect(res.status).toBe(200);
    expect(lastEmailTo("nessuno@example.com")).toBeUndefined();
  });
});

describe("Account page", () => {
  async function signedIn(email: string) {
    await signUp(email);
    const res = await signIn(email);
    return cookiesOf(res);
  }

  it("changes the password with the current one, and tells the owner by email", async () => {
    const email = "cambio-password@example.com";
    const cookie = await signedIn(email);

    const wrong = await authPost("/change-password", { currentPassword: "sbagliata-di-sicuro", newPassword: "una-password-nuova" }, cookie);
    expect(wrong.status).toBe(400);
    expect(lastEmailTo(email)?.subject).not.toBe("La password di Snippo è cambiata");

    const ok = await authPost("/change-password", { currentPassword: PASSWORD, newPassword: "una-password-nuova", revokeOtherSessions: true }, cookie);
    expect(ok.status).toBe(200);
    expect(lastEmailTo(email)?.subject).toBe("La password di Snippo è cambiata");
    expect((await signIn(email, "una-password-nuova")).status).toBe(200);
  });

  it("changes the name", async () => {
    const cookie = await signedIn("cambio-nome@example.com");
    expect((await authPost("/update-user", { name: "Mario Bianchi" }, cookie)).status).toBe(200);
    const me = await (await apiWithCookie(cookie)("/me")).json<{ user: { name: string } }>();
    expect(me.user.name).toBe("Mario Bianchi");
  });

  it("changes the email only once the new address is confirmed", async () => {
    const cookie = await signedIn("vecchia@example.com");
    const api = apiWithCookie(cookie);

    expect((await authPost("/change-email", { newEmail: "nuova@example.com", callbackURL: "/account" }, cookie)).status).toBe(200);
    const message = lastEmailTo("nuova@example.com");
    expect(message?.subject).toBe("Conferma il tuo indirizzo email");
    expect((await (await api("/me")).json<{ user: { email: string } }>()).user.email).toBe("vecchia@example.com");

    await open(message!.url);
    expect((await (await api("/me")).json<{ user: { email: string } }>()).user.email).toBe("nuova@example.com");
    expect((await signIn("nuova@example.com")).status).toBe(200);
  });
});
