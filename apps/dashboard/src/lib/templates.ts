import type { SubmissionStatus, TemplateId } from "@snippo/shared";
import { msg } from "../i18n";

// Texts in Italian, marked with msg(): the pages show them with t().

export const templateInfo: Record<TemplateId, { label: string; description: string; icon: string }> = {
  restaurant: { label: msg("Ristorante"), description: msg("Prenotazione tavolo: giorno, orario, persone."), icon: "🍝" },
  appointments: { label: msg("Appuntamenti"), description: msg("Saloni e studi: servizio, giorno, fascia oraria."), icon: "💇" },
  info: { label: msg("Richiesta info"), description: msg("Domande e preventivi, con risposta via email."), icon: "💬" },
};

export const statusInfo: Record<SubmissionStatus, { label: string; plural: string; className: string }> = {
  new: { label: msg("Nuova"), plural: msg("Nuove"), className: "bg-amber-50 text-amber-800 ring-amber-200" },
  confirmed: { label: msg("Confermata"), plural: msg("Confermate"), className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  rejected: { label: msg("Rifiutata"), plural: msg("Rifiutate"), className: "bg-slate-100 text-slate-600 ring-slate-200" },
  completed: { label: msg("Completata"), plural: msg("Completate"), className: "bg-sky-50 text-sky-800 ring-sky-200" },
};
