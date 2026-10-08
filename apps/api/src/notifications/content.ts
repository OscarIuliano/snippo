import { formatBooking, type FlowDefinition } from "@snippo/shared";

export interface NotificationContent {
  subject: string;
  /** Plain text: email fallback and the development log. */
  text: string;
  html: string;
  /** Short text for WhatsApp, where the action buttons come from the approved template. */
  whatsappText: string;
}

interface SubmissionForNotification {
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  bookingAt: string | null;
  partySize: number | null;
  answers: Record<string, string>;
}

interface Links {
  confirm: string;
  reject: string;
  dashboard: string;
}

const HEADER_KEYS = new Set(["name", "phone", "email", "date", "time", "party_size"]);

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

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
  const prompt = (key: string) => flow?.steps.find((s) => s.key === key)?.prompt ?? key;
  const rows: [string, string][] = [
    ["Telefono", submission.contactPhone],
    ["Email", submission.contactEmail],
    ...Object.entries(submission.answers).filter(([key]) => !HEADER_KEYS.has(key)).map(([key, value]) => [prompt(key), value] as const),
  ].filter((row): row is [string, string] => Boolean(row[1]));

  const text = [
    `Nuova richiesta per ${projectName}`,
    "",
    headline,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Conferma: ${links.confirm}`,
    `Rifiuta: ${links.reject}`,
    `Apri nella dashboard: ${links.dashboard}`,
  ].join("\n");

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;${
      primary ? "background:#4f46e5;color:#ffffff" : "background:#ffffff;color:#44403c;border:1px solid #d6d3d1"
    }">${label}</a>`;

  const html = `<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e7e5e4">
<p style="margin:0;color:#78716c;font-size:14px">Nuova richiesta per ${escapeHtml(projectName)}</p>
<h1 style="margin:8px 0 16px;font-size:20px">${escapeHtml(headline)}</h1>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#78716c;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`)
    .join("")}</table>
<p style="margin:24px 0 0">${button(links.confirm, "Conferma", true)} ${button(links.reject, "Rifiuta", false)}</p>
<p style="margin:24px 0 0;font-size:13px"><a href="${escapeHtml(links.dashboard)}" style="color:#4f46e5">Apri nella dashboard</a></p>
</div></body></html>`;

  return {
    subject: `Nuova richiesta: ${headline}`,
    text,
    html,
    whatsappText: `Nuova richiesta per ${projectName}: ${headline}${submission.contactPhone ? ` · ${submission.contactPhone}` : ""}`,
  };
}

export function buildTestNotification(projectName: string, dashboardUrl: string): NotificationContent {
  const text = `Notifica di prova da Snippo per ${projectName}.\nSe la ricevi, le nuove richieste arriveranno qui.\n\nDashboard: ${dashboardUrl}`;
  return {
    subject: `Notifica di prova · ${projectName}`,
    text,
    html: `<!doctype html><html lang="it"><body style="font-family:system-ui,sans-serif;padding:24px"><p>Notifica di prova da Snippo per <strong>${escapeHtml(projectName)}</strong>.</p><p>Se la ricevi, le nuove richieste arriveranno qui.</p><p><a href="${escapeHtml(dashboardUrl)}">Apri la dashboard</a></p></body></html>`,
    whatsappText: `Notifica di prova da Snippo per ${projectName}. Le nuove richieste arriveranno qui.`,
  };
}
