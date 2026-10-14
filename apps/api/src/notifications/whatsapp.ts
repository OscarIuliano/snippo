// WhatsApp Cloud API: notifications go out from Snippo's shared number as approved templates,
// because a business that has not written to us first can only receive templates.
// No imports, so scripts/whatsapp-templates.ts can load this file with plain Node.

export const GRAPH_API = "https://graph.facebook.com/v23.0";
export const TEMPLATE_LANGUAGE = "it";

/**
 * The templates Snippo sends. Meta has to approve each one (category "utility") on the
 * WhatsApp Business Account before it can be used; the script creates them.
 * Variables may not open or close the body, and their values may not contain new lines.
 */
export const whatsappTemplates = {
  newSubmission: {
    name: "snippo_nuova_richiesta",
    body: "Nuova richiesta per {{1}}:\n{{2}}\n\nConferma o rifiuta con i pulsanti qui sotto, oppure apri la dashboard di Snippo.",
    examples: ["Osteria del Porto", "Anna · sabato 18 ottobre, 20:30 · 4 persone · +39 333 1234567"],
    /** URL buttons: the base comes from the template, the action token is the variable part. */
    buttons: ["Conferma", "Rifiuta"],
  },
  test: {
    name: "snippo_notifica_prova",
    body: "Notifica di prova da Snippo per {{1}}. Da ora le nuove richieste arriveranno su questo numero.",
    examples: ["Osteria del Porto"],
    buttons: [],
  },
} as const;

export type WhatsAppTemplateKey = keyof typeof whatsappTemplates;

export interface WhatsAppMessage {
  template: WhatsAppTemplateKey;
  /** Values for {{1}}, {{2}}, … in the body. */
  params: string[];
  /** Variable part of each URL button, in order. */
  buttonParams?: string[];
}

/** Template definition for POST /{waba-id}/message_templates. */
export function templateDefinition(key: WhatsAppTemplateKey, actionsBaseUrl: string) {
  const t = whatsappTemplates[key];
  const components: unknown[] = [{ type: "BODY", text: t.body, example: { body_text: [t.examples] } }];
  if (t.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: t.buttons.map((text) => ({ type: "URL", text, url: `${actionsBaseUrl}/{{1}}`, example: [`${actionsBaseUrl}/esempio`] })),
    });
  }
  return { name: t.name, language: TEMPLATE_LANGUAGE, category: "UTILITY", components };
}

/** Meta refuses empty values, new lines, tabs and more than four spaces in a row; the body has a size limit too. */
export function templateParam(value: string, max = 300): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "-";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Request body for POST /{phone-number-id}/messages. `to` is in E.164, as channels store it. */
export function messageRequest(to: string, message: WhatsAppMessage) {
  const components: unknown[] = [{ type: "body", parameters: message.params.map((text) => ({ type: "text", text: templateParam(text) })) }];
  (message.buttonParams ?? []).forEach((text, index) => {
    components.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text }] });
  });
  return {
    messaging_product: "whatsapp",
    to: to.replace(/^\+/, ""),
    type: "template",
    template: { name: whatsappTemplates[message.template].name, language: { code: TEMPLATE_LANGUAGE }, components },
  };
}

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
}

/**
 * Sends one template message and returns Meta's message id. Throws on any error, so the queue
 * retries it. "Accepted" is not "delivered": a later failure (number locked, user not on
 * WhatsApp) only arrives through the webhook.
 */
export async function sendWhatsApp(config: WhatsAppConfig, to: string, message: WhatsAppMessage, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(`${GRAPH_API}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(messageRequest(to, message)),
  });
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number; message?: string; error_data?: { details?: string } } };
  const id = data.messages?.[0]?.id;
  if (res.ok && id) return id;
  const error = data.error;
  throw new Error(`WhatsApp ${res.status}${error?.code ? ` (${error.code})` : ""}: ${error?.error_data?.details ?? error?.message ?? "risposta inattesa"}`);
}
