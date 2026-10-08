import type { SubmissionStatus, TemplateId } from "@snippo/shared";

export const templateInfo: Record<TemplateId, { label: string; description: string; icon: string }> = {
  restaurant: { label: "Ristorante", description: "Prenotazione tavolo: giorno, orario, persone.", icon: "🍝" },
  appointments: { label: "Appuntamenti", description: "Saloni e studi: servizio, giorno, fascia oraria.", icon: "💇" },
  info: { label: "Richiesta info", description: "Domande e preventivi, con risposta via email.", icon: "💬" },
};

export const statusInfo: Record<SubmissionStatus, { label: string; plural: string; className: string }> = {
  new: { label: "Nuova", plural: "Nuove", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  confirmed: { label: "Confermata", plural: "Confermate", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  rejected: { label: "Rifiutata", plural: "Rifiutate", className: "bg-slate-100 text-slate-600 ring-slate-200" },
  completed: { label: "Completata", plural: "Completate", className: "bg-sky-50 text-sky-800 ring-sky-200" },
};
