import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { normalizeDomain, type TemplateId } from "@snippo/shared";
import { Alert, Button, Card, Field, Input, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { templateInfo } from "../lib/templates";

export function NewProjectPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateId>("restaurant");
  const [domainError, setDomainError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: { name: string; domain: string; template: TemplateId }) =>
      api<{ id: string }>("/projects", { method: "POST", body: input }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/progetti/$projectId/installazione", params: { projectId: id } });
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const domain = String(form.get("domain"));
    if (!normalizeDomain(domain)) return setDomainError("Inserisci un dominio valido, ad esempio trattoria.it");
    setDomainError(null);
    create.mutate({ name: String(form.get("name")), domain, template });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuovo progetto" description="Un progetto è un sito: scegli il template e ti prepariamo il widget." />
      <form onSubmit={onSubmit} className="space-y-6">
        <Card title="Che tipo di attività è?" description="Il template definisce le domande del widget. Potrai cambiarlo dopo.">
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(templateInfo) as TemplateId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTemplate(id)}
                aria-pressed={template === id}
                className={cx(
                  "rounded-xl p-4 text-left ring-1 transition",
                  template === id ? "bg-brand-50 ring-2 ring-brand-600" : "bg-white ring-slate-200 hover:ring-slate-300",
                )}
              >
                <span className="text-2xl" aria-hidden>{templateInfo[id].icon}</span>
                <span className="mt-2 block font-medium">{templateInfo[id].label}</span>
                <span className="mt-1 block text-sm text-slate-500">{templateInfo[id].description}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Il tuo sito">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome dell'attività" hint="Appare come titolo del widget.">
              <Input name="name" required minLength={2} maxLength={80} placeholder="Trattoria da Mario" />
            </Field>
            <Field label="Dominio del sito" hint="Il widget funzionerà solo qui e nei sottodomini." error={domainError}>
              <Input name="domain" required placeholder="trattoria.it" />
            </Field>
          </div>
        </Card>

        {create.error && <Alert>{create.error.message}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creazione…" : "Crea progetto"}</Button>
        </div>
      </form>
    </div>
  );
}
