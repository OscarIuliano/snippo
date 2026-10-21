import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { sendEmail, type Email } from "../src/email";

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
