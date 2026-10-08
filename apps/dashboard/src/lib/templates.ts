import type { SubmissionStatus, TemplateId } from "@snippo/shared";

export const templateInfo: Record<TemplateId, { label: string; description: string; icon: string }> = {
  restaurant: { label: "Ristorante", description: "Prenotazione tavolo: giorno, orario, persone.", icon: "🍝" },
  appointments: { label: "Appuntamenti", description: "Saloni e studi: servizio, giorno, fascia oraria.", icon: "💇" },
  info: { label: "Richiesta info", description: "Domande e preventivi, con risposta via email.", icon: "💬" },
};

export const statusInfo: Record<SubmissionStatus, { label: string; className: string }> = {
  new: { label: "Nuova", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  confirmed: { label: "Confermata", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  rejected: { label: "Rifiutata", className: "bg-stone-100 text-stone-600 ring-stone-200" },
  completed: { label: "Completata", className: "bg-sky-50 text-sky-800 ring-sky-200" },
};
