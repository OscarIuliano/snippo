import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { sendEmail, signupNoticeEmail, type Email } from "../src/email";

const email: Email = { to: "customer@example.com", subject: "Oggetto", text: "Testo", html: "<p>Testo</p>" };

describe("sendEmail", () => {
  it("sends through the EMAIL binding from EMAIL_FROM, with replyTo, text and html", async () => {
    const send = vi.fn(async () => ({ messageId: "m1" }));
    const bindings = {
      ...env,
      EMAIL: { send } as unknown as SendEmail,
      EMAIL_FROM: "noreply@snippo.io",
      EMAIL_REPLY_TO: "supporto@snippo.io",
    };

    await expect(sendEmail(bindings, email)).resolves.toEqual({ id: "m1" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      from: { email: "noreply@snippo.io", name: "Snippo" },
      to: "customer@example.com",
      replyTo: "supporto@snippo.io",
      subject: "Oggetto",
      text: "Testo",
      html: "<p>Testo</p>",
    });
  });

  it("logs the email when there is no EMAIL binding", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(sendEmail({ ...env, EMAIL: undefined, EMAIL_FROM: "noreply@snippo.io" }, email)).resolves.toEqual({});
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe("signupNoticeEmail", () => {
  it("tells the owner, in Italian, who signed up and how many accounts there are", () => {
    const user = { name: "Giulia Bianchi", email: "giulia@example.com", createdAt: new Date("2026-10-21T10:30:00Z") };
    const notice = signupNoticeEmail("owner@example.com", user, 42);
    expect(notice.to).toBe("owner@example.com");
    expect(notice.subject).toBe("Nuova registrazione: Giulia Bianchi");
    expect(notice.text).toContain("Nome: Giulia Bianchi");
    expect(notice.text).toContain("Email: giulia@example.com");
    expect(notice.text).toContain("Quando: ");
    expect(notice.text).toContain("Account in totale: 42");
    expect(notice.html).toContain("Account in totale: 42");
  });

  it("says where the account came from, or that it came directly", () => {
    const user = { name: "Giulia Bianchi", email: "giulia@example.com", createdAt: new Date() };
    const sourced = signupNoticeEmail("owner@example.com", { ...user, signupSource: "instagram / paid / ristoranti-test" }, 3);
    expect(sourced.text).toContain("Provenienza: instagram / paid / ristoranti-test");
    expect(sourced.html).toContain("Provenienza: instagram / paid / ristoranti-test");
    for (const signupSource of [undefined, null]) {
      const direct = signupNoticeEmail("owner@example.com", { ...user, signupSource }, 3);
      expect(direct.text).toContain("Provenienza: diretta (nessun link di campagna)");
    }
  });

  it("escapes the name in the html", () => {
    const notice = signupNoticeEmail("owner@example.com", { name: "<b>X</b>", email: "x@example.com", createdAt: new Date() }, 1);
    expect(notice.html).not.toContain("<b>X</b>");
    expect(notice.html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });
});
