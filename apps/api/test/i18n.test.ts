import { afterEach, describe, expect, it, vi } from "vitest";
import { authPost, signUp } from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("languages", () => {
  it("answers errors in the language of the dashboard, Italian by default", async () => {
    const api = await signUp("lingua-errori@example.com");
    const italian = await api("/projects/does-not-exist");
    expect((await italian.json<{ title: string }>()).title).toBe("Progetto non trovato");

    const english = await api("/projects/does-not-exist", { headers: { "Accept-Language": "en-GB,en;q=0.9" } });
    expect(english.status).toBe(404);
    expect((await english.json<{ title: string }>()).title).toBe("Project not found");
  });

  it("writes the account emails in the language chosen at sign-up", async () => {
    const subjects: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      const match = /Oggetto: (.+)\n/.exec(String(line));
      if (match) subjects.push(match[1]!);
    });
    expect((await authPost("/sign-up/email", { name: "Jane Doe", email: "jane@example.com", password: "a-safe-password", locale: "en" })).status).toBe(200);
    expect((await authPost("/sign-up/email", { name: "Mario Neri", email: "mario.neri@example.com", password: "a-safe-password" })).status).toBe(200);
    expect(subjects).toEqual(["Confirm your email address", "Conferma il tuo indirizzo email"]);
  });

  it("refuses a language it does not have", async () => {
    const res = await authPost("/sign-up/email", { name: "Hans", email: "hans@example.com", password: "a-safe-password", locale: "de" });
    expect(res.status).toBe(400);
  });
});
