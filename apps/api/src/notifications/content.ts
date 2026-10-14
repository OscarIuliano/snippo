import { formatBooking, type FlowDefinition } from "@snippo/shared";
import { emailButton, emailLayout, escapeHtml } from "../email";
import type { WhatsAppMessage } from "./whatsapp";

export { escapeHtml };

export interface NotificationContent {
  subject: string;
  /** Plain text: email fallback and the development log. */
  text: string;
  html: string;
  /** Short text for the development log, in place of the WhatsApp template. */
  whatsappText: string;
  /** The approved template that carries this notification on WhatsApp. */
  whatsapp: WhatsAppMessage;
}

interface SubmissionForNotification {
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  bookingAt: string | null;
  partySize: number | null;
  answers: Record<string, string>;
  /** Made by "Invia prova": said in the subject and the first line. */
  isTest?: boolean;
}

interface Links {
  confirm: string;
  reject: string;
  dashboard: string;
}

const HEADER_KEYS = new Set(["name", "phone", "email", "date", "time", "party_size"]);

export function submissionHeadline(s: Pick<SubmissionForNotification, "contactName" | "bookingAt" | "partySize">): string {
  return [
    s.contactName ?? "Nuovo contatto",
    s.bookingAt ? formatBooking(s.bookingAt) : null,
    s.partySize ? `${s.partySize} ${s.partySize === 1 ? "persona" : "persone"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function buildSubmissionNotification(
  projectName: string,
  submission: SubmissionForNotification,
  flow: FlowDefinition | null,
  links: Links,
): NotificationContent {
  const headline = submissionHeadline(submission);
  const intro = submission.isTest ? `Richiesta di prova per ${projectName}` : `Nuova richiesta per ${projectName}`;
  const prompt = (key: string) => flow?.steps.find((s) => s.key === key)?.prompt ?? key;
  const rows: [string, string][] = [
    ["Telefono", submission.contactPhone],
    ["Email", submission.contactEmail],
    ...Object.entries(submission.answers).filter(([key]) => !HEADER_KEYS.has(key)).map(([key, value]) => [prompt(key), value] as const),
  ].filter((row): row is [string, string] => Boolean(row[1]));

  const text = [
    intro,
    "",
    headline,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Conferma: ${links.confirm}`,
    `Rifiuta: ${links.reject}`,
    `Apri nella dashboard: ${links.dashboard}`,
  ].join("\n");

  const html = emailLayout(`<p style="margin:0;color:#64748b;font-size:14px">${escapeHtml(intro)}</p>
<h1 style="margin:8px 0 16px;font-size:20px">${escapeHtml(headline)}</h1>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`)
    .join("")}</table>
<p style="margin:24px 0 0">${emailButton(links.confirm, "Conferma")} ${emailButton(links.reject, "Rifiuta", false)}</p>
<p style="margin:24px 0 0;font-size:13px"><a href="${escapeHtml(links.dashboard)}" style="color:#c94a0a">Apri nella dashboard</a></p>`);

  const details = [headline, ...rows.map(([label, value]) => (label === "Telefono" || label === "Email" ? value : `${label}: ${value}`))].join(" · ");
  return {
    subject: `${submission.isTest ? "[Prova] " : ""}Nuova richiesta: ${headline}`,
    text,
    html,
    whatsappText: `${intro}: ${details}`,
    // The buttons of the template hold ${PUBLIC_API_URL}/v1/actions/; only the token varies.
    whatsapp: { template: "newSubmission", params: [submission.isTest ? `${projectName} (prova)` : projectName, details], buttonParams: [lastSegment(links.confirm), lastSegment(links.reject)] },
  };
}

export function buildTestNotification(projectName: string, dashboardUrl: string): NotificationContent {
  const text = `Notifica di prova da Snippo per ${projectName}.\nSe la ricevi, le nuove richieste arriveranno qui.\n\nDashboard: ${dashboardUrl}`;
  return {
    subject: `Notifica di prova · ${projectName}`,
    text,
    html: emailLayout(
      `<p style="margin:0 0 12px">Notifica di prova da Snippo per <strong>${escapeHtml(projectName)}</strong>.</p><p style="margin:0 0 20px">Se la ricevi, le nuove richieste arriveranno qui.</p><p style="margin:0">${emailButton(dashboardUrl, "Apri la dashboard")}</p>`,
    ),
    whatsappText: `Notifica di prova da Snippo per ${projectName}. Le nuove richieste arriveranno qui.`,
    whatsapp: { template: "test", params: [projectName] },
  };
}

const lastSegment = (url: string) => new URL(url).pathname.split("/").pop() ?? "";
