import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { normalizeDomain, type ProjectDetail, type TemplateId, type UpdateWidgetInput } from "@snippo/shared";
import { Alert, Button, Card, Field, Input, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { projectQuery } from "../lib/queries";
import { templateInfo } from "../lib/templates";

export function WidgetPage({ projectId }: { projectId: string }) {
  const project = useQuery(projectQuery(projectId));
  if (project.error) return <Alert>{project.error.message}</Alert>;
  if (!project.data) return <p className="py-12 text-center text-sm text-stone-500">Caricamento…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Widget" description="Aspetto, domande e siti su cui il widget è autorizzato." />
      <AppearanceCard project={project.data} />
      <TemplateCard project={project.data} />
      <DomainsCard project={project.data} />
    </div>
  );
}

function useProjectMutation<T>(projectId: string, fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  });
}

function AppearanceCard({ project }: { project: ProjectDetail }) {
  const [theme, setTheme] = useState<UpdateWidgetInput>(project.widget.theme);
  const [saved, setSaved] = useState(false);
  const save = useProjectMutation(project.id, (input: UpdateWidgetInput) =>
    api(`/projects/${project.id}/widget`, { method: "PATCH", body: input }),
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    save.mutate(theme, { onSuccess: () => setSaved(true) });
  }

  return (
    <Card title="Aspetto">
      <form onSubmit={onSubmit} className="grid gap-6 sm:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <Field label="Titolo della chat">
            <Input value={theme.title} maxLength={60} required onChange={(e) => setTheme({ ...theme, title: e.target.value })} />
          </Field>
          <Field label="Colore">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.primaryColor}
                onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded-lg border-0 bg-transparent"
                aria-label="Colore del widget"
              />
              <span className="font-mono text-sm text-stone-600">{theme.primaryColor}</span>
            </div>
          </Field>
          <fieldset>
            <legend className="text-sm font-medium text-stone-800">Posizione</legend>
            <div className="mt-2 flex gap-4 text-sm">
              {(["right", "left"] as const).map((position) => (
                <label key={position} className="flex items-center gap-2">
                  <input type="radio" name="position" checked={theme.position === position} onChange={() => setTheme({ ...theme, position })} className="accent-brand-700" />
                  {position === "right" ? "In basso a destra" : "In basso a sinistra"}
                </label>
              ))}
            </div>
          </fieldset>
          {save.error && <Alert>{save.error.message}</Alert>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvataggio…" : "Salva"}</Button>
            {saved && <span className="text-sm text-emerald-700">Salvato. Il widget si aggiorna entro un minuto.</span>}
          </div>
        </div>
        <Preview theme={theme} />
      </form>
    </Card>
  );
}

function Preview({ theme }: { theme: UpdateWidgetInput }) {
  return (
    <div aria-hidden className="relative h-56 w-full overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200 sm:w-48">
      <div className={cx("absolute bottom-16 w-40 overflow-hidden rounded-lg bg-white shadow-lg", theme.position === "right" ? "right-3" : "left-3")}>
        <div className="truncate px-3 py-2 text-xs font-semibold text-white" style={{ backgroundColor: theme.primaryColor }}>{theme.title || " "}</div>
        <div className="space-y-1.5 p-2">
          <div className="h-3 w-24 rounded bg-stone-200" />
          <div className="ml-auto h-3 w-16 rounded" style={{ backgroundColor: theme.primaryColor }} />
        </div>
      </div>
      <div
        className={cx("absolute bottom-3 grid size-10 place-items-center rounded-full text-lg shadow", theme.position === "right" ? "right-3" : "left-3")}
        style={{ backgroundColor: theme.primaryColor }}
      >
        💬
      </div>
    </div>
  );
}

function TemplateCard({ project }: { project: ProjectDetail }) {
  const change = useProjectMutation(project.id, (template: TemplateId) =>
    api(`/projects/${project.id}/template`, { method: "PUT", body: { template } }),
  );

  function choose(template: TemplateId) {
    if (template === project.widget.template) return;
    if (confirm(`Passare al template "${templateInfo[template].label}"? Le domande del widget cambieranno per le nuove conversazioni.`)) {
      change.mutate(template);
    }
  }

  return (
    <Card title="Domande" description="Il template decide cosa chiede il widget. Le richieste già ricevute non cambiano.">
      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(templateInfo) as TemplateId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => choose(id)}
            disabled={change.isPending}
            aria-pressed={project.widget.template === id}
            className={cx(
              "rounded-xl p-3 text-left text-sm ring-1 transition",
              project.widget.template === id ? "bg-brand-50 ring-2 ring-brand-600" : "bg-white ring-stone-200 hover:ring-stone-300",
            )}
          >
            <span aria-hidden>{templateInfo[id].icon}</span> <span className="font-medium">{templateInfo[id].label}</span>
          </button>
        ))}
      </div>
      {project.widget.flow && (
        <ol className="mt-5 space-y-1.5 text-sm text-stone-600">
          {project.widget.flow.steps.map((step, i) => (
            <li key={step.key} className="flex gap-2">
              <span className="w-5 shrink-0 text-right text-stone-400">{i + 1}.</span>
              <span>{step.prompt}{step.type !== "message" && !step.required && <span className="text-stone-400"> (facoltativa)</span>}</span>
            </li>
          ))}
        </ol>
      )}
      {change.error && <div className="mt-3"><Alert>{change.error.message}</Alert></div>}
    </Card>
  );
}

function DomainsCard({ project }: { project: ProjectDetail }) {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = useProjectMutation(project.id, (value: string) => api(`/projects/${project.id}/domains`, { method: "POST", body: { domain: value } }));
  const remove = useProjectMutation(project.id, (id: string) => api(`/projects/${project.id}/domains/${id}`, { method: "DELETE" }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!normalizeDomain(domain)) return setError("Dominio non valido, ad esempio trattoria.it");
    setError(null);
    add.mutate(domain, { onSuccess: () => setDomain("") });
  }

  return (
    <Card title="Siti autorizzati" description="Il widget risponde solo su questi domini e sui loro sottodomini (www compreso).">
      <ul className="divide-y divide-stone-100 rounded-lg ring-1 ring-stone-200">
        {project.domains.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-mono">{d.domain}</span>
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              disabled={remove.isPending || project.domains.length === 1}
              title={project.domains.length === 1 ? "Serve almeno un dominio" : undefined}
              onClick={() => remove.mutate(d.id)}
            >
              Rimuovi
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="nuovo-sito.it" aria-label="Nuovo dominio" />
        <Button type="submit" variant="secondary" disabled={add.isPending}>Aggiungi</Button>
      </form>
      {(error || add.error) && <div className="mt-3"><Alert>{error ?? add.error?.message}</Alert></div>}
    </Card>
  );
}
