import { useQuery } from "@tanstack/react-query";
import { Card, PageHeader, buttonClass } from "../components/ui";
import { Icon } from "../components/Icon";
import { msg, useT } from "../i18n";
import { meQuery } from "../lib/queries";
import { SITE_URL, SUPPORT_EMAIL } from "../lib/site";

// Quick answers live on the public support page, so a customer who cannot sign in finds them too.
const GUIDES = [
  { anchor: "widget", title: msg("Il widget non compare sul mio sito") },
  { anchor: "notifiche", title: msg("Non mi arrivano le notifiche") },
  { anchor: "domande", title: msg("Voglio cambiare le domande della chat") },
  { anchor: "cliente", title: msg("Come rispondo al cliente dopo aver confermato o rifiutato?") },
  { anchor: "privacy", title: msg("Un cliente chiede di vedere o cancellare i suoi dati") },
  { anchor: "team", title: msg("Voglio far usare Snippo a un collega") },
  { anchor: "eliminare", title: msg("Voglio eliminare un progetto o il mio account") },
];

export function HelpPage() {
  const t = useT();
  const me = useQuery(meQuery);

  // The account details go in the message, so support knows who writes without asking back.
  const details = me.data
    ? [
        `${t("Account")}: ${me.data.user.email}`,
        `${t("Organizzazione")}: ${me.data.organization.name}`,
        ...me.data.projects.map((p) => `${t("Progetto")}: ${p.name} (${p.id})`),
      ].join("\n")
    : "";
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("Aiuto con Snippo"))}&body=${encodeURIComponent(`${t("Ciao,")}\n\n\n\n---\n${details}`)}`;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("Aiuto")} description={t("Le risposte ai dubbi più comuni e come scriverci.")} />

      <Card title={t("Scrivici")} description={t("Rispondiamo entro un giorno lavorativo, di solito prima.")}>
        <a href={mailto} className={buttonClass("primary")}>
          <Icon name="mail" className="size-4" />
          {t("Scrivi al supporto")}
        </a>
        <p className="mt-3 text-sm text-slate-500">
          {t("Si apre la tua email con l'account e i progetti già scritti in fondo. Oppure scrivi a {email}.", { email: SUPPORT_EMAIL })}
        </p>
      </Card>

      <Card title={t("Risposte rapide")}>
        <ul className="-my-2 divide-y divide-slate-100">
          {GUIDES.map((g) => (
            <li key={g.anchor}>
              <a href={`${SITE_URL}/supporto#${g.anchor}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 py-2.5 text-sm text-slate-700 hover:text-brand-800">
                {t(g.title)}
                <span aria-hidden className="text-slate-400">↗</span>
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-sm text-slate-500">
        <a href={`${SITE_URL}/privacy`} target="_blank" rel="noreferrer" className="hover:text-slate-800 hover:underline">{t("Informativa privacy")}</a>
        {" · "}
        <a href={`${SITE_URL}/termini`} target="_blank" rel="noreferrer" className="hover:text-slate-800 hover:underline">{t("Termini di servizio")}</a>
        {" · "}
        <a href={`${SITE_URL}/dpa`} target="_blank" rel="noreferrer" className="hover:text-slate-800 hover:underline">{t("Accordo sul trattamento dei dati")}</a>
      </p>
    </div>
  );
}
