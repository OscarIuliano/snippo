import { normalizePhone } from "./notifications";

// The message a business sends its customer after confirming or rejecting a request. It leaves
// from the business's own WhatsApp or email (a wa.me or mailto link), so it costs nothing and
// needs no Meta approval; the business can still change it before sending.
// The texts are for the business's customers, in Italian like the widget.

export type ReplyOutcome = "confirmed" | "rejected";

export interface ReplyInput {
  outcome: ReplyOutcome;
  /** The project's industry, which picks the wording: a table, an appointment, a request. */
  industry: string;
  projectName: string;
  contactName: string | null;
  bookingAt: string | null;
  partySize: number | null;
  answers: Record<string, string>;
}

const longDay = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });

/** "2026-10-18T20:30" -> "sabato 18 ottobre alle 20:30". */
export function bookingPhrase(bookingAt: string): string {
  const [date, time] = bookingAt.split("T");
  const day = longDay.format(new Date(`${date}T12:00:00`));
  return time && time !== "00:00" ? `${day} alle ${time}` : day;
}

export function customerReply(input: ReplyInput): { subject: string; text: string } {
  const firstName = input.contactName?.trim().split(/\s+/)[0];
  const hello = firstName ? `Ciao ${firstName},` : "Ciao,";
  // "il tavolo per 4 persone sabato 17 ottobre alle 20:30", "non abbiamo posto per sabato 17 ottobre …"
  const on = input.bookingAt ? ` ${bookingPhrase(input.bookingAt)}` : "";
  const forDay = input.bookingAt ? ` per ${bookingPhrase(input.bookingAt)}` : "";
  const confirmed = input.outcome === "confirmed";
  let body: string;

  if (input.industry === "restaurant") {
    const table = input.partySize ? `il tavolo per ${input.partySize} ${input.partySize === 1 ? "persona" : "persone"}` : "il tavolo";
    body = confirmed
      ? `${hello} ti confermiamo ${table}${on}. A presto!`
      : `${hello} ci dispiace, non abbiamo posto${forDay}. Se vuoi, rispondi a questo messaggio e troviamo un altro orario.`;
  } else if (input.industry === "appointments") {
    const service = input.answers.service && input.answers.service !== "Altro" ? ` per ${input.answers.service.toLowerCase()}` : "";
    body = confirmed
      ? `${hello} ti confermiamo l'appuntamento${service}${on}. A presto!`
      : `${hello} ci dispiace, non riusciamo a riceverti${forDay}. Se vuoi, rispondi a questo messaggio e troviamo un altro orario.`;
  } else {
    body = confirmed
      ? `${hello} grazie per averci scritto, abbiamo ricevuto la tua richiesta. `
      : `${hello} grazie per averci scritto. Purtroppo non possiamo aiutarti con questa richiesta.`;
  }

  return {
    subject: confirmed ? `${input.projectName}: richiesta confermata` : `${input.projectName}: la tua richiesta`,
    text: `${body.trimEnd()}\n${input.projectName}`,
  };
}

/** Opens WhatsApp on the customer's chat with the text ready; null when the number is not valid. */
export function whatsappUrl(phone: string, text: string): string | null {
  const number = normalizePhone(phone);
  return number ? `https://wa.me/${number.slice(1)}?text=${encodeURIComponent(text)}` : null;
}

export function mailtoUrl(email: string, subject: string, text: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

export function telUrl(phone: string): string {
  return `tel:${normalizePhone(phone) ?? phone.replace(/\s/g, "")}`;
}
