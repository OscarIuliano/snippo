import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createActionToken, verifyActionToken } from "../src/notifications/action-token";
import { buildSubmissionNotification } from "../src/notifications/content";
import { sendWhatsApp, templateDefinition, templateParam, whatsappTemplates } from "../src/notifications/whatsapp";

const config = { token: "token-di-prova", phoneNumberId: "1375767865620856" };

/** A fetch that records the request and answers like the Graph API would. */
function fakeGraph(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json(body, { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

describe("WhatsApp notifications", () => {
  it("sends a new submission as the approved template, with the action tokens in the buttons", async () => {
    const actionUrl = async (action: "confirmed" | "rejected") =>
      `https://api.snippo.test/v1/actions/${await createActionToken(env.BETTER_AUTH_SECRET, "submission-1", action)}`;
    const content = buildSubmissionNotification(
      "Osteria del Porto",
      { contactName: "Anna", contactPhone: "+39 333 1234567", contactEmail: null, bookingAt: null, partySize: 4, answers: { note: "Seggiolone\nper favore" } },
      null,
      { confirm: await actionUrl("confirmed"), reject: await actionUrl("rejected"), dashboard: "https://app.snippo.test" },
    );
    const { calls, fetcher } = fakeGraph(200, { messages: [{ id: "wamid.ABC" }] });

    expect(await sendWhatsApp(config, "+393331234567", content.whatsapp, fetcher)).toBe("wamid.ABC");

    expect(calls[0]!.url).toBe("https://graph.facebook.com/v23.0/1375767865620856/messages");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("Bearer token-di-prova");
    const request = JSON.parse(String(calls[0]!.init.body));
    expect(request).toMatchObject({ to: "393331234567", type: "template", template: { name: "snippo_nuova_richiesta", language: { code: "it" } } });
    const [body, confirm, reject] = request.template.components;
    expect(body.parameters.map((p: { text: string }) => p.text)).toEqual(["Osteria del Porto", "Anna · 4 persone · +39 333 1234567 · note: Seggiolone per favore"]);
    expect(await verifyActionToken(env.BETTER_AUTH_SECRET, confirm.parameters[0].text)).toEqual({ submissionId: "submission-1", action: "confirmed" });
    expect(reject).toMatchObject({ type: "button", sub_type: "url", index: "1" });
    expect(await verifyActionToken(env.BETTER_AUTH_SECRET, reject.parameters[0].text)).toEqual({ submissionId: "submission-1", action: "rejected" });
  });

  it("throws Meta's error, so the queue retries and the dashboard shows why", async () => {
    const { fetcher } = fakeGraph(400, { error: { code: 132001, message: "Template name does not exist in the translation" } });
    await expect(sendWhatsApp(config, "+393331234567", { template: "test", params: ["Osteria"] }, fetcher)).rejects.toThrow(
      "WhatsApp 400 (132001): Template name does not exist in the translation",
    );
  });

  it("keeps template values within Meta's rules", () => {
    expect(templateParam("  Anna\n\tRossi     ")).toBe("Anna Rossi");
    expect(templateParam("")).toBe("-");
    expect(templateParam("x".repeat(400))).toHaveLength(300);
  });

  it("defines templates Meta accepts: no variable at the edges, one URL button per action", () => {
    for (const template of Object.values(whatsappTemplates)) {
      expect(template.body).not.toMatch(/^\{\{|\}\}\.?$/);
      expect(template.examples).toHaveLength(template.body.match(/\{\{\d\}\}/g)!.length);
    }
    const definition = templateDefinition("newSubmission", "https://api.snippo.test/v1/actions");
    expect(definition.components[1]).toMatchObject({
      buttons: [
        { type: "URL", text: "Conferma", url: "https://api.snippo.test/v1/actions/{{1}}" },
        { type: "URL", text: "Rifiuta", url: "https://api.snippo.test/v1/actions/{{1}}" },
      ],
    });
  });
});
