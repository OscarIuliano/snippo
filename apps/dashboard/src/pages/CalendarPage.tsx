import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { addDays, formatBooking, type SubmissionRow, type SubmissionStatus } from "@snippo/shared";
import { Alert, Button, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { calendarQuery, projectQuery } from "../lib/queries";
import { statusInfo } from "../lib/templates";

const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const monthFormat = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });

/** Today in the browser's local time, as "YYYY-MM-DD". */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const shiftMonth = (month: string, delta: number) => {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
};
/** Monday = 0 ... Sunday = 6 */
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** The weeks shown for a month: from the Monday before the 1st to the Sunday after the last day. */
function monthGrid(month: string): string[] {
  const first = addDays(month, -weekday(month));
  const lastOfMonth = addDays(shiftMonth(month, 1), -1);
  const last = addDays(lastOfMonth, 6 - weekday(lastOfMonth));
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return days;
}

const people = (items: SubmissionRow[]) => items.reduce((sum, s) => sum + (s.partySize ?? 0), 0);

export function CalendarPage({ projectId }: { projectId: string }) {
  const [month, setMonth] = useState(() => monthStart(today()));
  const [selected, setSelected] = useState(today);
  const days = useMemo(() => monthGrid(month), [month]);
  const project = useQuery(projectQuery(projectId));
  const calendar = useQuery(calendarQuery(projectId, days[0]!, days.at(-1)!));

  const byDay = useMemo(() => {
    const map = new Map<string, SubmissionRow[]>();
    for (const s of calendar.data ?? []) {
      const day = s.bookingAt!.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), s]);
    }
    return map;
  }, [calendar.data]);

  function goTo(newMonth: string, day?: string) {
    setMonth(newMonth);
    if (day) setSelected(day);
  }

  if (project.data?.industry === "info") {
    return (
      <div>
        <PageHeader title="Calendario" />
        <p className="rounded-xl border border-dashed border-stone-300 px-6 py-12 text-center text-sm text-stone-500">
          Il calendario mostra le richieste con un giorno e un orario: usa il template Ristorante o Appuntamenti per averlo.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Calendario"
        description="Prenotazioni nuove e confermate per giorno. Le rifiutate non compaiono."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" aria-label="Mese precedente" onClick={() => goTo(shiftMonth(month, -1))}>‹</Button>
            <Button variant="secondary" onClick={() => goTo(monthStart(today()), today())}>Oggi</Button>
            <Button variant="secondary" aria-label="Mese successivo" onClick={() => goTo(shiftMonth(month, 1))}>›</Button>
          </div>
        }
      />
      {calendar.error && <div className="mb-4"><Alert>{calendar.error.message}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label={monthFormat.format(new Date(`${month}T00:00:00Z`))} className="rounded-xl bg-white ring-1 ring-stone-200">
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold capitalize">{monthFormat.format(new Date(`${month}T00:00:00Z`))}</h2>
          <div className="grid grid-cols-7 border-b border-stone-200 text-center text-xs font-medium text-stone-500">
            {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className={cx("grid grid-cols-7", calendar.isPending && "opacity-50")}>
            {days.map((day) => {
              const items = byDay.get(day) ?? [];
              const inMonth = day.slice(0, 7) === month.slice(0, 7);
              const hasNew = items.some((s) => s.status === "new");
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => (inMonth ? setSelected(day) : goTo(monthStart(day), day))}
                  aria-pressed={selected === day}
                  aria-label={`${formatBooking(day)}: ${items.length} richieste`}
                  className={cx(
                    "flex min-h-16 flex-col items-start gap-1 border-b border-r border-stone-100 p-1.5 text-left text-sm transition sm:min-h-24 sm:p-2 [&:nth-child(7n)]:border-r-0",
                    inMonth ? "bg-white hover:bg-stone-50" : "bg-stone-50/60 text-stone-400",
                    selected === day && "bg-brand-50 ring-2 ring-brand-600 ring-inset hover:bg-brand-50",
                  )}
                >
                  <span className={cx("grid size-6 place-items-center rounded-full text-xs", day === today() && "bg-brand-700 font-semibold text-white")}>
                    {Number(day.slice(8))}
                  </span>
                  {items.length > 0 && (
                    <span className="flex items-center gap-1 text-xs">
                      {hasNew && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title="Da confermare" />}
                      <span className="font-medium text-stone-800">{items.length}</span>
                      <span className="hidden text-stone-500 sm:inline">{people(items) ? `· ${people(items)} pers.` : ""}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <DayAgenda projectId={projectId} day={selected} items={byDay.get(selected) ?? []} loading={calendar.isPending} />
      </div>
    </div>
  );
}

function DayAgenda({ projectId, day, items, loading }: { projectId: string; day: string; items: SubmissionRow[]; loading: boolean }) {
  const byTime = useMemo(() => {
    const map = new Map<string, SubmissionRow[]>();
    for (const s of items) {
      const time = s.bookingAt!.slice(11, 16) || "—";
      map.set(time, [...(map.get(time) ?? []), s]);
    }
    return [...map.entries()];
  }, [items]);
  const confirmed = people(items.filter((s) => s.status !== "new"));
  const pending = people(items.filter((s) => s.status === "new"));

  return (
    <section aria-label={`Agenda di ${formatBooking(day)}`} className="rounded-xl bg-white p-4 ring-1 ring-stone-200 sm:p-5">
      <h2 className="font-semibold capitalize">{formatBooking(day)}</h2>
      {items.length > 0 && (
        <p className="mt-1 text-sm text-stone-500">
          {confirmed} {confirmed === 1 ? "persona confermata" : "persone confermate"}
          {pending > 0 && <span className="text-amber-700"> · {pending} da confermare</span>}
        </p>
      )}
      {!loading && items.length === 0 && <p className="mt-4 text-sm text-stone-500">Nessuna prenotazione per questo giorno.</p>}

      <div className="mt-4 space-y-5">
        {byTime.map(([time, group]) => (
          <div key={time}>
            <h3 className="flex items-baseline justify-between border-b border-stone-100 pb-1 text-sm">
              <span className="font-semibold">{time}</span>
              <span className="text-xs text-stone-500">{people(group) ? `${people(group)} persone` : `${group.length} richieste`}</span>
            </h3>
            <ul className="mt-2 space-y-2">
              {group.map((s) => <AgendaItem key={s.id} projectId={projectId} submission={s} />)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgendaItem({ projectId, submission: s }: { projectId: string; submission: SubmissionRow }) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (status: SubmissionStatus) => api(`/submissions/${s.id}`, { method: "PATCH", body: { status } }),
    onSuccess: () =>
      Promise.all(
        [["calendar", projectId], ["submissions", projectId], ["me"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

  return (
    <li className="rounded-lg p-2 text-sm ring-1 ring-stone-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {s.contactName ?? "Senza nome"}
            {s.partySize ? <span className="font-normal text-stone-500"> · {s.partySize} pers.</span> : null}
          </p>
          {s.contactPhone && (
            <a href={`tel:${s.contactPhone.replace(/\s/g, "")}`} className="text-xs text-stone-500 hover:underline">{s.contactPhone}</a>
          )}
        </div>
        <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1", statusInfo[s.status].className)}>{statusInfo[s.status].label}</span>
      </div>
      {s.answers.notes && <p className="mt-1 text-xs text-stone-600">{s.answers.notes}</p>}
      {s.status === "new" && (
        <div className="mt-2 flex gap-2">
          <Button className="px-2.5 py-1 text-xs" disabled={update.isPending} onClick={() => update.mutate("confirmed")}>Conferma</Button>
          <Button variant="danger" className="px-2.5 py-1 text-xs" disabled={update.isPending} onClick={() => update.mutate("rejected")}>Rifiuta</Button>
        </div>
      )}
      {update.error && <p className="mt-2 text-xs text-red-700">{update.error.message}</p>}
    </li>
  );
}
