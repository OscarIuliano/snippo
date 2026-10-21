import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, Button, Card, Field, Input, PageHeader } from "../components/ui";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { meQuery, projectQuery } from "../lib/queries";

export function ProjectSettingsPage({ projectId }: { projectId: string }) {
  const t = useT();
  const project = useQuery(projectQuery(projectId));
  if (project.error) return <Alert>{project.error.message}</Alert>;
  if (!project.data) return <p className="py-12 text-center text-sm text-slate-500">{t("Caricamento…")}</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("Impostazioni del progetto")} description={t("Il nome del progetto e la sua eliminazione.")} />
      <NameCard projectId={projectId} name={project.data.name} />
      <DeleteProjectCard projectId={projectId} name={project.data.name} />
    </div>
  );
}

function NameCard({ projectId, name }: { projectId: string; name: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api(`/projects/${projectId}`, { method: "PATCH", body: { name: value.trim() } }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: meQuery.queryKey }), queryClient.invalidateQueries({ queryKey: projectQuery(projectId).queryKey })]);
      setSaved(true);
    },
  });

  return (
    <Card title={t("Nome")} description={t("Lo vedi tu e il tuo team, e compare nelle notifiche. Il titolo mostrato nella chat si cambia dalla pagina Widget.")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-56 flex-1">
          <Field label={t("Nome del progetto")}>
            <Input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(false);
              }}
              required
              minLength={2}
              maxLength={80}
            />
          </Field>
        </div>
        <Button type="submit" disabled={save.isPending || value.trim() === name || value.trim().length < 2}>{t("Salva")}</Button>
      </form>
      {saved && <p className="mt-3 text-sm text-emerald-700">{t("Salvato.")}</p>}
      {save.error && <div className="mt-3"><Alert>{save.error.message}</Alert></div>}
    </Card>
  );
}

function DeleteProjectCard({ projectId, name }: { projectId: string; name: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => api(`/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: async () => {
      // The menu and the home page pick the next project from /me: refresh it before leaving.
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
      queryClient.removeQueries({ queryKey: projectQuery(projectId).queryKey });
      await navigate({ to: "/", replace: true });
    },
  });

  return (
    <Card title={t("Elimina progetto")} description={t("Cancella per sempre il progetto e i suoi dati. Non si può annullare.")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          remove.mutate();
        }}
        className="space-y-4 text-sm"
      >
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>{t("Si cancellano le richieste ricevute, le domande, gli orari, le chiusure, i domini, le notifiche e le statistiche.")}</li>
          <li>{t("Il widget sparisce dai siti dove è installato: i visitatori non vedono errori, solo niente chat.")}</li>
          <li>{t("Il team e gli altri progetti restano come sono.")}</li>
        </ul>
        <Field label={t("Per confermare scrivi il nome del progetto")}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoComplete="off" spellCheck={false} />
        </Field>
        <Button type="submit" variant="danger" disabled={typed.trim() !== name || remove.isPending}>
          {remove.isPending ? t("Eliminazione…") : t("Elimina definitivamente")}
        </Button>
        {remove.error && <Alert>{remove.error.message}</Alert>}
      </form>
    </Card>
  );
}
