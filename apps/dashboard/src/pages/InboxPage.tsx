import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { canManageProjects, formatBooking, submissionStatuses, type FlowDefinition, type ReplyOutcome, type SubmissionRow, type SubmissionStatus } from "@snippo/shared";
import { Icon } from "../components/Icon";
import { NotifyCustomer } from "../components/NotifyCustomer";
import { ManualBadge, TestBadge } from "../components/TestBadge";
import { Alert, Button, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { msg, useFormat, useI18n, useT } from "../i18n";
import { meQuery, projectQuery, submissionsQuery } from "../lib/queries";
import { statusInfo } from "../lib/templates";

const emptyTitle: Record<SubmissionStatus | "all", string> = {
  all: msg("Nessuna richiesta per ora"),
  new: msg("Nessuna richiesta nuova"),
  confirmed: msg("Nessuna richiesta confermata"),
  rejected: msg("Nessuna richiesta rifiutata"),
  completed: msg("Nessuna richiesta completata"),
};

// Answers already shown in the card header.
const HEADER_KEYS = new Set(["name", "phone", "email", "date", "time", "party_size"]);

export function InboxPage({ projectId }: { projectId: string }) {
  const t = useT();
  const [status, setStatus] = useState<SubmissionStatus | undefined>("new");
  const project = useQuery(projectQuery(projectId));
  const submissions = useQuery(submissionsQuery(projectId, status));
  const counts = submissions.data?.counts;
  // The request just confirmed or rejected leaves the "Nuove" tab: this keeps "Avvisa il cliente" in view.
  const [handled, setHandled] = useState<{ submission: SubmissionRow; outcome: ReplyOutcome } | null>(null);

  return (
    <div>
      <PageHeader title={t("Richieste")} description={t("Le richieste arrivate dal widget, le più recenti in alto.")} />

      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {[undefined, ...submissionStatuses].map((s) => (
          <button
            key={s ?? "all"}
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cx(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
              status === s ? "border-brand-700 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {s ? t(statusInfo[s].plural) : t("Tutte")}
            {s && counts ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{counts[s]}</span> : null}
          </button>
        ))}
      </div>

      {handled && project.data && (
        <div role="status" className="mb-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">
              {handled.outcome === "confirmed"
                ? t("Richiesta di {name} confermata.", { name: handled.submission.contactName ?? t("Senza nome") })
                : t("Richiesta di {name} rifiutata.", { name: handled.submission.contactName ?? t("Senza nome") })}
              {handled.submission.isTest && <TestBadge />}
              <span className="font-normal text-slate-500"> {t("Il cliente non lo sa ancora: avvisalo tu, il messaggio è già scritto.")}</span>
            </p>
            <button type="button" onClick={() => setHandled(null)} aria-label={t("Chiudi")} className="-m-1 rounded p-1 text-slate-400 hover:text-slate-700">
              <Icon name="close" className="size-4" />
            </button>
          </div>
          <NotifyCustomer key={handled.submission.id} submission={handled.submission} project={project.data} outcome={handled.outcome} className="mt-3" />
        </div>
      )}

      {submissions.error && <Alert>{submissions.error.message}</Alert>}
      {submissions.isPending && <p className="py-12 text-center text-sm text-slate-500">{t("Caricamento…")}</p>}
      {submissions.data?.items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center">
          <p className="font-medium">{t(emptyTitle[status ?? "all"])}</p>
          <p className="mt-1 text-sm text-slate-500">
            {t("Hai già installato il widget?")}{" "}
            <Link to="/progetti/$projectId/installazione" params={{ projectId }} className="font-medium text-brand-700 hover:underline">
              {t("Vedi come fare")}
            </Link>
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {submissions.data?.items.map((s) => (
          <SubmissionCard
            key={s.id}
            submission={s}
            projectId={projectId}
            project={project.data}
            onHandled={(outcome) => setHandled({ submission: s, outcome })}
          />
        ))}
      </ul>
    </div>
  );
}

function SubmissionCard({
  submission: s,
  projectId,
  project,
  onHandled,
}: {
  submission: SubmissionRow;
  projectId: string;
  project: { name: string; industry: string; widget: { flow: FlowDefinition | null } } | undefined;
  onHandled: (outcome: ReplyOutcome) => void;
}) {
  const flow = project?.widget.flow ?? null;
  const { t, intl } = useI18n();
  const receivedFormat = useFormat((intl) => new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (status: SubmissionStatus) => api(`/submissions/${s.id}`, { method: "PATCH", body: { status } }),
    onSuccess: (_, status) => {
      if (status === "confirmed" || status === "rejected") onHandled(status);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["submissions", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["calendar", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
    },
  });

  const me = useQuery(meQuery);
  const canDelete = me.data ? canManageProjects(me.data.organization.role) : false;
  const remove = useMutation({
    mutationFn: () => api(`/submissions/${s.id}`, { method: "DELETE" }),
    onSuccess: () =>
      Promise.all(
        [["submissions", projectId], ["calendar", projectId], ["me"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

  const prompt = (key: string) => flow?.steps.find((step) => step.key === key)?.prompt ?? key;
  const details = Object.entries(s.answers).filter(([key]) => !HEADER_KEYS.has(key));

  return (
    <li className="rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {s.contactName ?? t("Senza nome")}
            {s.isTest && <TestBadge />}
            {s.source === "manual" && <ManualBadge />}
            {s.partySize ? <span className="font-normal text-slate-500"> · {s.partySize === 1 ? t("1 persona") : t("{count} persone", { count: s.partySize })}</span> : null}
          </p>
          {s.bookingAt && <p className="mt-0.5 text-sm font-medium text-brand-700">{formatBooking(s.bookingAt, intl)}</p>}
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-slate-600">
            {s.contactPhone && <a href={`tel:${s.contactPhone.replace(/\s/g, "")}`} className="hover:underline">{s.contactPhone}</a>}
            {s.contactEmail && <a href={`mailto:${s.contactEmail}`} className="hover:underline">{s.contactEmail}</a>}
          </p>
        </div>
        <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium ring-1", statusInfo[s.status].className)}>
          {t(statusInfo[s.status].label)}
        </span>
      </div>

      {details.length > 0 && (
        <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
          {details.map(([key, value]) => (
            <div key={key} className="sm:flex sm:gap-2">
              <dt className="text-slate-500">{prompt(key)}</dt>
              <dd className="text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {project && (s.status === "confirmed" || s.status === "rejected") && (
        <NotifyCustomer submission={s} project={project} outcome={s.status} className="mt-3 border-t border-slate-100 pt-3" />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {s.status === "new" && (
          <>
            <Button onClick={() => update.mutate("confirmed")} disabled={update.isPending}>{t("Conferma")}</Button>
            <Button variant="danger" onClick={() => update.mutate("rejected")} disabled={update.isPending}>{t("Rifiuta")}</Button>
          </>
        )}
        {s.status === "confirmed" && (
          <Button variant="secondary" onClick={() => update.mutate("completed")} disabled={update.isPending}>{t("Segna come completata")}</Button>
        )}
        {(s.status === "rejected" || s.status === "completed") && (
          <Button variant="ghost" onClick={() => update.mutate("new")} disabled={update.isPending}>{t("Riporta tra le nuove")}</Button>
        )}
        {/* Date and delete stay together: on a narrow screen they wrap as one line, not one each. */}
        <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
          {t("Ricevuta {date}", { date: receivedFormat.format(new Date(s.createdAt)) })}
          {canDelete && (
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              disabled={remove.isPending}
              onClick={() => confirm(t("Eliminare definitivamente questa richiesta?")) && remove.mutate()}
            >
              {t("Elimina")}
            </Button>
          )}
        </span>
      </div>
      {(update.error || remove.error) && <div className="mt-3"><Alert>{(update.error ?? remove.error)!.message}</Alert></div>}
    </li>
  );
}
