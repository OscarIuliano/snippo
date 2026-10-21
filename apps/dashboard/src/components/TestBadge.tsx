import { useT } from "../i18n";

/** Marks a request made by "Invia prova" in Notifiche. */
export function TestBadge() {
  const t = useT();
  return <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 align-middle text-xs font-medium text-violet-700 ring-1 ring-violet-200">{t("Prova")}</span>;
}

/** Marks a booking the business added by hand from the calendar (phone, walk-in). */
export function ManualBadge({ className = "ml-1.5" }: { className?: string }) {
  const t = useT();
  return <span className={`${className} rounded-full bg-slate-100 px-1.5 py-0.5 align-middle text-xs font-medium text-slate-700 ring-1 ring-slate-300`}>{t("Manuale")}</span>;
}
