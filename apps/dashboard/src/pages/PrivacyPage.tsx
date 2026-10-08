import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import type { PrivacyMatch, SubmissionStatus } from "@snippo/shared";
import { Alert, Button, Card, Input, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { statusInfo } from "../lib/templates";

const PERIODS = [6, 12, 24, 36, 60];
const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });

export function PrivacyPage({ projectId }: { projectId: string }) {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Privacy" description="Per quanto tempo conservi le richieste, e cosa fare quando una persona chiede i suoi dati o la cancellazione." />
      <RetentionCard projectId={projectId} />
      <PersonCard projectId={projectId} />
    </div>
  );
}

function RetentionCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const current = useQuery({ queryKey: ["privacy", projectId], queryFn: () => api<{ retentionMonths: number }>(`/projects/${projectId}/privacy`) });
  const [months, setMonths] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (current.data && months === null) setMonths(current.data.retentionMonths);
  }, [current.data, months]);

  const save = useMutation({
    mutationFn: () => api(`/projects/${projectId}/privacy`, { method: "PUT", body: { retentionMonths: months } }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["privacy", projectId] });
    },
  });
  const options = [...new Set([...PERIODS, ...(months ? [months] : [])])].sort((a, b) => a - b);

  return (
    <Card title="Conservazione dei dati" description="Ogni notte Snippo cancella le richieste più vecchie di questo periodo, con i relativi dati di contatto.">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={months ?? ""}
          onChange={(e) => {
            setMonths(Number(e.target.value));
            setSaved(false);
          }}
          aria-label="Periodo di conservazione"
          className="rounded-lg border-0 bg-white px-2 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600"
        >
          {options.map((m) => <option key={m} value={m}>{m} mesi</option>)}
        </select>
        <Button onClick={() => save.mutate()} disabled={save.isPending || months === current.data?.retentionMonths}>Salva</Button>
        {saved && <span className="text-sm text-emerald-700">Salvato: vale dalla prossima notte.</span>}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Tieni le richieste solo per il tempo che ti serve davvero (principio di limitazione della conservazione del GDPR). Indica lo stesso periodo nella tua informativa privacy.
      </p>
      {(current.error || save.error) && <div className="mt-3"><Alert>{(current.error ?? save.error)!.message}</Alert></div>}
    </Card>
  );
}

function PersonCard({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const results = useQuery({
    queryKey: ["privacy-search", projectId, searched],
    queryFn: () => api<PrivacyMatch[]>(`/projects/${projectId}/privacy/search?q=${encodeURIComponent(searched!)}`),
    enabled: searched !== null,
  });
  useEffect(() => setSelected(new Set(results.data?.map((r) => r.id))), [results.data]);

  const download = useMutation({
    mutationFn: async () => {
      const data = await api<unknown>(`/projects/${projectId}/privacy/export?q=${encodeURIComponent(searched!)}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = Object.assign(document.createElement("a"), { href: url, download: `dati-richieste-${new Date().toISOString().slice(0, 10)}.json` });
      link.click();
      URL.revokeObjectURL(url);
    },
  });
  const erase = useMutation({
    mutationFn: () => api<{ deleted: number }>(`/projects/${projectId}/privacy/erase`, { method: "POST", body: { ids: [...selected] } }),
    onSuccess: async ({ deleted }) => {
      setDone(`${deleted} ${deleted === 1 ? "richiesta cancellata" : "richieste cancellate"}.`);
      await Promise.all(
        [["privacy-search", projectId], ["submissions", projectId], ["calendar", projectId], ["me"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    setSearched(query.trim());
  }

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <Card title="Richieste di una persona" description="Quando qualcuno chiede quali dati hai su di lui, o di cancellarli: cercalo per telefono, email o nome.">
      <form onSubmit={onSearch} className="flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="333 123 4567, mario@email.it o Mario Rossi" aria-label="Telefono, email o nome" minLength={3} required />
        <Button type="submit" variant="secondary">Cerca</Button>
      </form>

      {results.error && <div className="mt-3"><Alert>{results.error.message}</Alert></div>}
      {results.data?.length === 0 && <p className="mt-4 text-sm text-slate-500">Nessuna richiesta trovata per "{searched}".</p>}
      {results.data && results.data.length > 0 && (
        <>
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {results.data.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-brand-700" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{r.contactName ?? "Senza nome"}</span>
                    <span className="text-slate-500"> · {[r.contactPhone, r.contactEmail].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{dateFormat.format(new Date(r.createdAt))}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ring-1 ${statusInfo[r.status as SubmissionStatus]?.className ?? ""}`}>
                    {statusInfo[r.status as SubmissionStatus]?.label ?? r.status}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={download.isPending} onClick={() => download.mutate()}>Scarica i dati (JSON)</Button>
            <Button
              variant="danger"
              disabled={selected.size === 0 || erase.isPending}
              onClick={() => confirm(`Cancellare definitivamente ${selected.size} richieste? Non si può annullare.`) && erase.mutate()}
            >
              Cancella le selezionate ({selected.size})
            </Button>
          </div>
        </>
      )}
      {done && <p className="mt-3 text-sm text-emerald-700">{done}</p>}
      {(download.error || erase.error) && <div className="mt-3"><Alert>{(download.error ?? erase.error)!.message}</Alert></div>}
    </Card>
  );
}
