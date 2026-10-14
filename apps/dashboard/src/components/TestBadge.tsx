import { useT } from "../i18n";

/** Marks a request made by "Invia prova" in Notifiche. */
export function TestBadge() {
  const t = useT();
  return <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 align-middle text-xs font-medium text-violet-700 ring-1 ring-violet-200">{t("Prova")}</span>;
}
