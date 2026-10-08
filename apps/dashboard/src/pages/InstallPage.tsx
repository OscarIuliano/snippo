import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Button, Card, PageHeader } from "../components/ui";
import { projectQuery } from "../lib/queries";

const WIDGET_URL = import.meta.env.VITE_WIDGET_URL ?? "https://cdn.snippo.io/v1/snippo.js";
const PUBLIC_API_URL = import.meta.env.VITE_PUBLIC_API_URL;

export function InstallPage({ projectId }: { projectId: string }) {
  const project = useQuery(projectQuery(projectId));
  const [copied, setCopied] = useState(false);
  if (project.error) return <Alert>{project.error.message}</Alert>;
  if (!project.data) return <p className="py-12 text-center text-sm text-slate-500">Caricamento…</p>;

  const apiAttribute = PUBLIC_API_URL ? `\n        data-api="${PUBLIC_API_URL}"` : "";
  const snippet = `<script src="${WIDGET_URL}"\n        data-key="${project.data.widget.publicKey}"${apiAttribute} async></script>`;
  const mailto = `mailto:?subject=${encodeURIComponent("Installazione widget Snippo")}&body=${encodeURIComponent(
    `Ciao,\npuoi aggiungere questo codice prima di </body> su tutte le pagine del sito ${project.data.domains[0]?.domain ?? ""}?\n\n${snippet}\n\nGrazie!`,
  )}`;

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Installazione" description="Una riga di codice e il widget è online." />
      <Card title="1. Copia il codice" description="Incollalo prima della chiusura di </body>, su tutte le pagine dove vuoi il widget.">
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm leading-relaxed text-slate-100"><code>{snippet}</code></pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={copy}>{copied ? "Copiato!" : "Copia codice"}</Button>
          <a href={mailto} className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
            Invia al tuo sviluppatore
          </a>
          {import.meta.env.DEV && (
            <a
              href={`http://localhost:5173/?key=${project.data.widget.publicKey}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Prova in locale ↗
            </a>
          )}
        </div>
      </Card>
      <Card title="2. Dove incollarlo">
        <ul className="space-y-2 text-sm text-slate-600">
          <li><span className="font-medium text-slate-800">WordPress:</span> con un plugin come "WPCode", nella sezione Footer.</li>
          <li><span className="font-medium text-slate-800">Wix, Squarespace, Shopify:</span> nelle impostazioni del sito, alla voce "Codice personalizzato" o "Code injection", nel footer.</li>
          <li><span className="font-medium text-slate-800">Sito su misura:</span> nel template comune a tutte le pagine, prima di &lt;/body&gt;.</li>
        </ul>
      </Card>
      <Card title="3. Controlla i domini">
        <p className="text-sm text-slate-600">
          Il widget appare solo su:{" "}
          {project.data.domains.map((d, i) => (
            <span key={d.id}>{i > 0 && ", "}<span className="font-mono text-slate-800">{d.domain}</span></span>
          ))}
          . Puoi aggiungerne altri nella pagina Widget.
        </p>
      </Card>
    </div>
  );
}
