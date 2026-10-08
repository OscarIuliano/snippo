import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  flowProblems,
  genericSteps,
  isSpecialKey,
  newStepKey,
  specialSteps,
  type FlowDefinitionInput,
  type FlowStepInput,
  type GenericType,
  type ProjectDetail,
  type SpecialKey,
  type TemplateId,
} from "@snippo/shared";
import { Alert, Button, Card, Input, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { projectQuery } from "../lib/queries";
import { templateInfo } from "../lib/templates";

type Step = FlowStepInput;

const typeLabel = (step: Step) =>
  isSpecialKey(step.key) ? specialSteps[step.key].label : genericSteps[step.type as GenericType]?.label ?? step.type;

export function FlowEditorPage({ projectId }: { projectId: string }) {
  const project = useQuery(projectQuery(projectId));
  if (project.error) return <Alert>{project.error.message}</Alert>;
  if (!project.data?.widget.flow) return <p className="py-12 text-center text-sm text-stone-500">Caricamento…</p>;
  // Remount on every published version: the draft restarts from what is live.
  return <Editor key={JSON.stringify(project.data.widget.flow)} project={project.data} />;
}

function Editor({ project }: { project: ProjectDetail }) {
  const queryClient = useQueryClient();
  const live = project.widget.flow!;
  const [draft, setDraft] = useState<FlowDefinitionInput>(() => structuredClone(live));
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(live);
  const problems = useMemo(() => flowProblems(draft), [draft]);
  useEffect(() => {
    if (dirty) setSaved(false);
  }, [dirty]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });
  const save = useMutation({
    mutationFn: () => api(`/projects/${project.id}/flow`, { method: "PUT", body: draft }),
    onSuccess: async () => {
      setSaved(true);
      await refresh();
    },
  });
  const restore = useMutation({
    mutationFn: (template: TemplateId) => api(`/projects/${project.id}/template`, { method: "PUT", body: { template } }),
    onSuccess: refresh,
  });

  const steps = draft.steps;
  const setSteps = (next: Step[]) => setDraft({ ...draft, steps: next });
  const update = (i: number, step: Step) => setSteps(steps.map((s, j) => (j === i ? step : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setSteps(next);
  };
  const usedKeys = steps.map((s) => s.key);
  const missingSpecial = (Object.keys(specialSteps) as SpecialKey[]).filter((k) => !usedKeys.includes(k));

  function restoreTemplate(template: TemplateId) {
    if (confirm(`Ripristinare le domande del template "${templateInfo[template].label}"? Le personalizzazioni andranno perse.`)) {
      restore.mutate(template);
    }
  }

  return (
    <div className="max-w-3xl space-y-6 pb-24">
      <PageHeader
        title="Domande"
        description="Cosa chiede il widget, in che ordine. Le richieste già ricevute restano con le domande di allora."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            Basate sul template <strong>{project.widget.template ? templateInfo[project.widget.template].label : "—"}</strong>
            {project.widget.customized && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-100">personalizzate</span>}
          </p>
          <label className="flex items-center gap-2 text-stone-600">
            Ripristina
            <select
              value=""
              disabled={restore.isPending}
              onChange={(e) => e.target.value && restoreTemplate(e.target.value as TemplateId)}
              className="rounded-lg border-0 bg-white px-2 py-1.5 text-sm ring-1 ring-stone-300 focus:ring-2 focus:ring-brand-600"
            >
              <option value="">un template…</option>
              {(Object.keys(templateInfo) as TemplateId[]).map((t) => <option key={t} value={t}>{templateInfo[t].label}</option>)}
            </select>
          </label>
        </div>
        {restore.error && <div className="mt-3"><Alert>{restore.error.message}</Alert></div>}
      </Card>

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <StepCard
            key={step.key}
            index={i}
            step={step}
            last={i === steps.length - 1}
            problems={problems.filter((p) => p.step === i).map((p) => p.message)}
            onChange={(s) => update(i, s)}
            onMove={(by) => move(i, by)}
            onRemove={() => setSteps(steps.filter((_, j) => j !== i))}
          />
        ))}
      </ol>

      <Card title="Aggiungi una domanda">
        {missingSpecial.length > 0 && (
          <>
            <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Con un significato per Snippo</p>
            <p className="mt-1 text-xs text-stone-500">Finiscono nei campi della richiesta, nel calendario e nelle notifiche.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {missingSpecial.map((k) => (
                <Button key={k} variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setSteps([...steps, structuredClone(specialSteps[k].step) as Step])}>
                  + {specialSteps[k].label}
                </Button>
              ))}
            </div>
          </>
        )}
        <p className={cx("text-xs font-medium tracking-wide text-stone-500 uppercase", missingSpecial.length > 0 && "mt-4")}>Personalizzate</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(genericSteps) as GenericType[]).map((t) => (
            <Button
              key={t}
              variant="secondary"
              className="px-2.5 py-1 text-xs"
              onClick={() => setSteps([...steps, { ...structuredClone(genericSteps[t].step), key: newStepKey(usedKeys) } as Step])}
            >
              + {genericSteps[t].label}
            </Button>
          ))}
        </div>
      </Card>

      <Card title="Messaggio finale" description="Quello che il cliente legge dopo aver inviato la richiesta.">
        <textarea
          value={draft.successMessage}
          onChange={(e) => setDraft({ ...draft, successMessage: e.target.value })}
          rows={2}
          maxLength={300}
          className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm ring-1 ring-stone-300 focus:ring-2 focus:ring-brand-600 focus:outline-none"
        />
      </Card>

      {(dirty || saved || save.error) && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
            {save.error ? (
              <span className="text-sm text-red-700">{save.error.message}</span>
            ) : problems.length > 0 ? (
              <span className="text-sm text-red-700">{problems.length === 1 ? problems[0]!.message : `${problems.length} problemi da sistemare`}</span>
            ) : saved && !dirty ? (
              <span className="text-sm text-emerald-700">Salvato. Il widget usa le nuove domande entro un minuto.</span>
            ) : (
              <span className="text-sm text-stone-600">Modifiche non salvate</span>
            )}
            <div className="ml-auto flex gap-2">
              {dirty && <Button variant="ghost" onClick={() => setDraft(structuredClone(live))}>Annulla</Button>}
              {dirty && <Button disabled={problems.length > 0 || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Salvataggio…" : "Salva le domande"}</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepCard(props: {
  index: number;
  step: Step;
  last: boolean;
  problems: string[];
  onChange: (step: Step) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { index, step, last, problems, onChange, onMove, onRemove } = props;

  return (
    <li className={cx("rounded-xl bg-white p-4 ring-1", problems.length > 0 ? "ring-red-300" : "ring-stone-200")}>
      <div className="flex items-center gap-2">
        <span className="w-6 text-sm text-stone-400">{index + 1}.</span>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">{typeLabel(step)}</span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" className="px-2 py-1 text-xs" disabled={index === 0} aria-label="Sposta su" onClick={() => onMove(-1)}>↑</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" disabled={last} aria-label="Sposta giù" onClick={() => onMove(1)}>↓</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" aria-label="Elimina domanda" onClick={() => confirm("Eliminare questa domanda?") && onRemove()}>✕</Button>
        </div>
      </div>

      <textarea
        value={step.prompt}
        onChange={(e) => onChange({ ...step, prompt: e.target.value })}
        rows={2}
        maxLength={300}
        aria-label={`Testo della domanda ${index + 1}`}
        className="mt-3 block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm ring-1 ring-stone-300 focus:ring-2 focus:ring-brand-600 focus:outline-none"
      />

      <div className="mt-3 space-y-3 text-sm">
        {step.type !== "message" && (
          <label className="flex items-center gap-2 text-stone-700">
            <input type="checkbox" checked={step.required !== false} onChange={(e) => onChange({ ...step, required: e.target.checked } as Step)} className="accent-brand-700" />
            Obbligatoria
          </label>
        )}
        {step.type === "choice" && <OptionsEditor options={step.options} placeholder="Opzione" onChange={(options) => onChange({ ...step, options })} />}
        {step.type === "time" && (
          <>
            <OptionsEditor options={step.options} type="time" onChange={(options) => onChange({ ...step, options: [...options].sort() })} />
            <p className="text-xs text-stone-500">Il widget propone solo quelli dentro gli orari di apertura e con posto libero (pagina Orari).</p>
          </>
        )}
        {step.type === "number" && (
          <div className="flex items-center gap-2">
            <span className="text-stone-600">Da</span>
            <Input type="number" value={step.min} onChange={(e) => onChange({ ...step, min: Number(e.target.value) })} className="w-24" aria-label="Minimo" />
            <span className="text-stone-600">a</span>
            <Input type="number" value={step.max} onChange={(e) => onChange({ ...step, max: Number(e.target.value) })} className="w-24" aria-label="Massimo" />
          </div>
        )}
        {problems.map((p) => <p key={p} className="text-red-700">{p}</p>)}
      </div>
    </li>
  );
}

function OptionsEditor({ options, onChange, type = "text", placeholder }: { options: string[]; onChange: (options: string[]) => void; type?: "text" | "time"; placeholder?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((o, i) => (
        <span key={i} className="flex items-center gap-1">
          <Input
            type={type}
            value={o}
            placeholder={placeholder}
            onChange={(e) => onChange(options.map((x, j) => (j === i ? e.target.value : x)))}
            className={type === "time" ? "w-28" : "w-36"}
            aria-label={`Opzione ${i + 1}`}
          />
          <Button variant="ghost" className="px-1.5 py-1 text-xs" aria-label={`Rimuovi opzione ${i + 1}`} disabled={options.length === 1} onClick={() => onChange(options.filter((_, j) => j !== i))}>
            ×
          </Button>
        </span>
      ))}
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onChange([...options, type === "time" ? "20:00" : `Opzione ${options.length + 1}`])}>
        + Aggiungi
      </Button>
    </div>
  );
}
