import { DEFAULT_LOCALE, isLocale, type Locale } from "@snippo/shared";
import type { AppEnv } from "./env";

export interface Email {
  to: string;
  subject: string;
  /** Plain text: fallback for mail clients without HTML, and the development log. */
  text: string;
  html: string;
}

/**
 * The one place every email leaves from. With the EMAIL binding (Cloudflare Email Service, staging
 * and production) the email is sent from EMAIL_FROM; without it, as in development and tests, it
 * goes to the Worker log, links included, so every flow can be tried by hand.
 */
export async function sendEmail(env: AppEnv["Bindings"], email: Email): Promise<{ id?: string }> {
  if (!env.EMAIL || !env.EMAIL_FROM) {
    console.log(`\n──── email → ${email.to} ────\nOggetto: ${email.subject}\n\n${email.text}\n────────────────────────────`);
    return {};
  }
  const { messageId } = await env.EMAIL.send({
    from: { email: env.EMAIL_FROM, name: "Snippo" },
    to: email.to,
    replyTo: env.EMAIL_REPLY_TO,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  return { id: messageId };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The shared look of every Snippo email: white card on a warm light page, orange buttons. */
export function emailLayout(body: string): string {
  return `<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#fffaf2;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#8a3110">snippo</p>
<div style="background:#ffffff;border-radius:16px;padding:24px;border:1px solid #e2e8f0">${body}</div>
</div></body></html>`;
}

export function emailButton(href: string, label: string, primary = true): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;${
    primary ? "background:#c94a0a;color:#ffffff" : "background:#ffffff;color:#334155;border:1px solid #cbd5e1"
  }">${escapeHtml(label)}</a>`;
}

type AccountEmail = "verify" | "reset" | "passwordChanged" | "deleted";

/** The account emails in each language: subject, paragraph, button and closing note. */
const accountCopy: Record<Locale, { hello: (name: string) => string } & Record<AccountEmail, { subject: string; intro: string; button?: string; note: string }>> = {
  it: {
    hello: (name) => `Ciao ${name},`,
    verify: {
      subject: "Conferma il tuo indirizzo email",
      intro: "Per usare questo indirizzo con Snippo, confermalo con il pulsante qui sotto.",
      button: "Conferma l'email",
      note: "Il link vale 24 ore. Se non hai chiesto tu un account Snippo, ignora questa email.",
    },
    reset: {
      subject: "Reimposta la password di Snippo",
      intro: "Abbiamo ricevuto una richiesta per reimpostare la password del tuo account. Scegli quella nuova con il pulsante qui sotto.",
      button: "Scegli una nuova password",
      note: "Il link vale 1 ora e funziona una sola volta. Se non l'hai chiesto tu, ignora questa email: la password resta quella di prima.",
    },
    passwordChanged: {
      subject: "La password di Snippo è cambiata",
      intro: "La password del tuo account Snippo è appena stata cambiata.",
      button: "Apri Snippo",
      note: "Se non sei stato tu, usa subito \"Password dimenticata?\" nella pagina di accesso per sceglierne una nuova.",
    },
    deleted: {
      subject: "Il tuo account Snippo è stato eliminato",
      intro: "Il tuo account Snippo è stato eliminato, insieme ai progetti di cui eri l'unico titolare e alle loro richieste.",
      note: "Puoi creare un nuovo account quando vuoi.",
    },
  },
  en: {
    hello: (name) => `Hi ${name},`,
    verify: {
      subject: "Confirm your email address",
      intro: "To use this address with Snippo, confirm it with the button below.",
      button: "Confirm email",
      note: "The link is valid for 24 hours. If you did not ask for a Snippo account, ignore this email.",
    },
    reset: {
      subject: "Reset your Snippo password",
      intro: "We received a request to reset the password of your account. Choose a new one with the button below.",
      button: "Choose a new password",
      note: "The link is valid for 1 hour and works only once. If you did not ask for it, ignore this email: your password stays the same.",
    },
    passwordChanged: {
      subject: "Your Snippo password has changed",
      intro: "The password of your Snippo account has just been changed.",
      button: "Open Snippo",
      note: "If it was not you, use \"Forgot your password?\" on the sign-in page right away to choose a new one.",
    },
    deleted: {
      subject: "Your Snippo account has been deleted",
      intro: "Your Snippo account has been deleted, together with the projects you were the only owner of and their requests.",
      note: "You can create a new account whenever you like.",
    },
  },
};

/** An account email: greeting, paragraph, an optional button and a closing note, in the user's language. */
export function accountEmail(kind: AccountEmail, user: { email: string; name: string; locale?: unknown }, url?: string): Email {
  const locale: Locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
  const copy = accountCopy[locale];
  const { subject, intro, button, note } = copy[kind];
  const hello = copy.hello(user.name);
  const action = button && url;
  const text = [hello, "", intro, ...(action ? ["", `${button}: ${url}`] : []), "", note].join("\n");
  const html = emailLayout(`<p style="margin:0 0 12px">${escapeHtml(hello)}</p>
<p style="margin:0 0 20px;line-height:1.5">${escapeHtml(intro)}</p>
${action ? `<p style="margin:0 0 20px">${emailButton(url, button)}</p>` : ""}
<p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">${escapeHtml(note)}</p>
${action ? `<p style="margin:12px 0 0;font-size:12px;color:#94a3b8;word-break:break-all">${escapeHtml(url)}</p>` : ""}`);
  return { to: user.email, subject, text, html };
}

/** For the owner of Snippo, in Italian: someone has just created an account. */
export function signupNoticeEmail(to: string, user: { email: string; name: string; createdAt: Date }, totalUsers: number): Email {
  const when = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(user.createdAt);
  const lines = [`Nome: ${user.name}`, `Email: ${user.email}`, `Quando: ${when}`, `Account in totale: ${totalUsers}`];
  const html = emailLayout(`<p style="margin:0 0 12px;font-weight:600">Nuova registrazione su Snippo</p>
<p style="margin:0;line-height:1.6">${lines.map(escapeHtml).join("<br>")}</p>`);
  return { to, subject: `Nuova registrazione: ${user.name}`, text: ["Nuova registrazione su Snippo", "", ...lines].join("\n"), html };
}
