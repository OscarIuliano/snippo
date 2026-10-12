import type { AppEnv } from "./env";

export interface Email {
  to: string;
  subject: string;
  /** Plain text: fallback for mail clients without HTML, and the development log. */
  text: string;
  html: string;
}

/**
 * The one place every email leaves from. For now it prints the email to the Worker log, links
 * included, so every flow can be tried by hand. Cloudflare Email Service takes over here once
 * snippo.io is on Cloudflare: only this function changes.
 */
export async function sendEmail(_env: AppEnv["Bindings"], email: Email): Promise<{ id?: string }> {
  console.log(`\n──── email → ${email.to} ────\nOggetto: ${email.subject}\n\n${email.text}\n────────────────────────────`);
  return {};
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The shared look of every Snippo email: white card on a light page, indigo buttons. */
export function emailLayout(body: string): string {
  return `<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#f8f8ff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#3730a3">snippo</p>
<div style="background:#ffffff;border-radius:16px;padding:24px;border:1px solid #e2e8f0">${body}</div>
</div></body></html>`;
}

export function emailButton(href: string, label: string, primary = true): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;${
    primary ? "background:#4f46e5;color:#ffffff" : "background:#ffffff;color:#334155;border:1px solid #cbd5e1"
  }">${escapeHtml(label)}</a>`;
}

/** An email with a greeting, a paragraph, one button and a closing note. */
function actionEmail(to: string, subject: string, opts: { name: string; intro: string; button: string; url: string; note: string }): Email {
  const text = [`Ciao ${opts.name},`, "", opts.intro, "", `${opts.button}: ${opts.url}`, "", opts.note].join("\n");
  const html = emailLayout(`<p style="margin:0 0 12px">Ciao ${escapeHtml(opts.name)},</p>
<p style="margin:0 0 20px;line-height:1.5">${escapeHtml(opts.intro)}</p>
<p style="margin:0 0 20px">${emailButton(opts.url, opts.button)}</p>
<p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">${escapeHtml(opts.note)}</p>
<p style="margin:12px 0 0;font-size:12px;color:#94a3b8;word-break:break-all">${escapeHtml(opts.url)}</p>`);
  return { to, subject, text, html };
}

export function verifyEmailMessage(to: string, name: string, url: string): Email {
  return actionEmail(to, "Conferma il tuo indirizzo email", {
    name,
    intro: "Per usare questo indirizzo con Snippo, confermalo con il pulsante qui sotto.",
    button: "Conferma l'email",
    url,
    note: "Il link vale 24 ore. Se non hai chiesto tu un account Snippo, ignora questa email.",
  });
}

export function resetPasswordMessage(to: string, name: string, url: string): Email {
  return actionEmail(to, "Reimposta la password di Snippo", {
    name,
    intro: "Abbiamo ricevuto una richiesta per reimpostare la password del tuo account. Scegli quella nuova con il pulsante qui sotto.",
    button: "Scegli una nuova password",
    url,
    note: "Il link vale 1 ora e funziona una sola volta. Se non l'hai chiesto tu, ignora questa email: la password resta quella di prima.",
  });
}

export function passwordChangedMessage(to: string, name: string, dashboardUrl: string): Email {
  return actionEmail(to, "La password di Snippo è cambiata", {
    name,
    intro: "La password del tuo account Snippo è appena stata cambiata.",
    button: "Apri Snippo",
    url: dashboardUrl,
    note: "Se non sei stato tu, usa subito \"Password dimenticata?\" nella pagina di accesso per sceglierne una nuova.",
  });
}
