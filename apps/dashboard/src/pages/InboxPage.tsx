import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { submissionStatuses, type FlowDefinition, type SubmissionRow, type SubmissionStatus } from "@snippo/shared";
import { Alert, Button, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { projectQuery, submissionsQuery } from "../lib/queries";
import { statusInfo } from "../lib/templates";

const dateFormat = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });
const receivedFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "2026-12-12T20:30" (business local time) -> "sab 12 dic, 20:30" */
function formatBooking(bookingAt: string) {
  const [date, time] = bookingAt.split("T");
  const day = dateFormat.format(new Date(`${date}T12:00:00`));
  return time && time !== "00:00" ? `${day}, ${time}` : day;
}

// Answers already shown in the card header.
const HEADER_KEYS = new Set(["name", "phone", "email", "date", "time", "party_size"]);

export function InboxPage({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<SubmissionStatus | undefined>("new");
  const project = useQuery(projectQuery(projectId));
  const submissions = useQuery(submissionsQuery(projectId, status));
  const counts = submissions.data?.counts;

  return (
    <div>
      <PageHeader title="Richieste" description="Le richieste arrivate dal widget, le più recenti in alto." />

      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-stone-200">
        {[undefined, ...submissionStatuses].map((s) => (
          <button
            key={s ?? "all"}
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cx(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
              status === s ? "border-brand-700 text-brand-700" : "border-transparent text-stone-500 hover:text-stone-800",
            )}
          >
            {s ? statusInfo[s].label : "Tutte"}
            {s && counts ? <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 text-xs text-stone-600">{counts[s]}</span> : null}
          </button>
        ))}
      </div>

      {submissions.error && <Alert>{submissions.error.message}</Alert>}
      {submissions.isPending && <p className="py-12 text-center text-sm text-stone-500">Caricamento…</p>}
      {submissions.data?.items.length === 0 && (
        <div className="rounded-xl border border-dashed border-stone-300 px-6 py-12 text-center">
          <p className="font-medium">Nessuna richiesta {status ? `in "${statusInfo[status].label}"` : "per ora"}</p>
          <p className="mt-1 text-sm text-stone-500">
            Hai già installato il widget?{" "}
            <Link to="/progetti/$projectId/installazione" params={{ projectId }} className="font-medium text-brand-700 hover:underline">
              Vedi come fare
            </Link>
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {submissions.data?.items.map((s) => (
          <SubmissionCard key={s.id} submission={s} projectId={projectId} flow={project.data?.widget.flow ?? null} />
        ))}
      </ul>
    </div>
  );
}

function SubmissionCard({ submission: s, projectId, flow }: { submission: SubmissionRow; projectId: string; flow: FlowDefinition | null }) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (status: SubmissionStatus) => api(`/submissions/${s.id}`, { method: "PATCH", body: { status } }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["submissions", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]),
  });

  const prompt = (key: string) => flow?.steps.find((step) => step.key === key)?.prompt ?? key;
  const details = Object.entries(s.answers).filter(([key]) => !HEADER_KEYS.has(key));

  return (
    <li className="rounded-xl bg-white p-4 ring-1 ring-stone-200 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {s.contactName ?? "Senza nome"}
            {s.partySize ? <span className="font-normal text-stone-500"> · {s.partySize} {s.partySize === 1 ? "persona" : "persone"}</span> : null}
          </p>
          {s.bookingAt && <p className="mt-0.5 text-sm font-medium text-brand-700">{formatBooking(s.bookingAt)}</p>}
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-stone-600">
            {s.contactPhone && <a href={`tel:${s.contactPhone.replace(/\s/g, "")}`} className="hover:underline">{s.contactPhone}</a>}
            {s.contactEmail && <a href={`mailto:${s.contactEmail}`} className="hover:underline">{s.contactEmail}</a>}
          </p>
        </div>
        <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium ring-1", statusInfo[s.status].className)}>
          {statusInfo[s.status].label}
        </span>
      </div>

      {details.length > 0 && (
        <dl className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-sm">
          {details.map(([key, value]) => (
            <div key={key} className="sm:flex sm:gap-2">
              <dt className="text-stone-500">{prompt(key)}</dt>
              <dd className="text-stone-800">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {s.status === "new" && (
          <>
            <Button onClick={() => update.mutate("confirmed")} disabled={update.isPending}>Conferma</Button>
            <Button variant="danger" onClick={() => update.mutate("rejected")} disabled={update.isPending}>Rifiuta</Button>
          </>
        )}
        {s.status === "confirmed" && (
          <Button variant="secondary" onClick={() => update.mutate("completed")} disabled={update.isPending}>Segna come completata</Button>
        )}
        {(s.status === "rejected" || s.status === "completed") && (
          <Button variant="ghost" onClick={() => update.mutate("new")} disabled={update.isPending}>Riporta tra le nuove</Button>
        )}
        <span className="ml-auto text-xs text-stone-400">Ricevuta {receivedFormat.format(new Date(s.createdAt))}</span>
      </div>
      {update.error && <div className="mt-3"><Alert>{update.error.message}</Alert></div>}
    </li>
  );
}
