import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { customerReply, mailtoUrl, whatsappUrl, type ReplyInput } from "@snippo/shared";
import { createActionToken } from "../src/notifications/action-token";
import { createProject, signUp, submitBooking } from "./helpers";

const base: ReplyInput = {
  outcome: "confirmed",
  industry: "restaurant",
  projectName: "Osteria del Porto",
  contactName: "Anna Rossi",
  bookingAt: "2026-10-17T20:30",
  partySize: 4,
  answers: {},
};

describe("message to the customer", () => {
  it("is written for the kind of business and the outcome", () => {
    expect(customerReply(base).text).toBe("Ciao Anna, ti confermiamo il tavolo per 4 persone sabato 17 ottobre alle 20:30. A presto!\nOsteria del Porto");
    expect(customerReply({ ...base, outcome: "rejected" }).text).toBe(
      "Ciao Anna, ci dispiace, non abbiamo posto per sabato 17 ottobre alle 20:30. Se vuoi, rispondi a questo messaggio e troviamo un altro orario.\nOsteria del Porto",
    );
    expect(customerReply({ ...base, industry: "appointments", projectName: "Salone Aurora", partySize: null, answers: { service: "Colore" } }).text).toBe(
      "Ciao Anna, ti confermiamo l'appuntamento per colore sabato 17 ottobre alle 20:30. A presto!\nSalone Aurora",
    );
    expect(customerReply({ ...base, industry: "info", contactName: null, bookingAt: null, partySize: null })).toEqual({
      subject: "Osteria del Porto: richiesta confermata",
      text: "Ciao, grazie per averci scritto, abbiamo ricevuto la tua richiesta.\nOsteria del Porto",
    });
  });

  it("opens WhatsApp and email with the text ready", () => {
    expect(whatsappUrl("333 111 2223", "Ciao Anna,\nA presto!")).toBe("https://wa.me/393331112223?text=Ciao%20Anna%2C%0AA%20presto!");
    expect(whatsappUrl("abc", "x")).toBeNull();
    expect(mailtoUrl("anna@example.com", "Oggetto", "Ciao")).toBe("mailto:anna@example.com?subject=Oggetto&body=Ciao");
  });

  it("is offered on the page reached from Conferma in a notification", async () => {
    const api = await signUp("notify-customer@example.com");
    const submissionId = await submitBooking(api, await createProject(api));
    const token = await createActionToken(env.BETTER_AUTH_SECRET, submissionId, "confirmed");

    const page = await (await exports.default.fetch(`https://api.snippo.test/v1/actions/${token}`, { method: "POST" })).text();
    expect(page).toContain("Avvisa Anna");
    expect(page).toContain("https://wa.me/393331112223?text=Ciao%20Anna%2C%20ti%20confermiamo%20il%20tavolo%20per%204%20persone");
    expect(page).toContain("tel:+393331112223");
  });
});
