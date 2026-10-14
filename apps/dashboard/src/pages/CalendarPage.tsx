import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { addDays, formatBooking, type SubmissionRow, type SubmissionStatus } from "@snippo/shared";
import { Alert, Button, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { msg, useFormat, useI18n, useT } from "../i18n";
import { calendarQuery, projectQuery } from "../lib/queries";
import { TestBadge } from "../components/TestBadge";
import { statusInfo } from "../lib/templates";

/** Formatters of this page in the user's language. */
function calendarFormats(intl: string) {
  const weekdayFormat = new Intl.DateTimeFormat(intl, { weekday: "short", timeZone: "UTC" });
  const longDayFormat = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return {
    // 1 January 2024 was a Monday: the seven days from it give the column headers, Monday first.
    weekdays: Array.from({ length: 7 }, (_, i) => weekdayFormat.format(new Date(Date.UTC(2024, 0, 1 + i)))),
    month: new Intl.DateTimeFormat(intl, { month: "long", year: "numeric", timeZone: "UTC" }),
    /** "2026-10-08" -> "Giovedì 8 ottobre" / "Thursday 8 October" */
    longDay: (date: string) => {
      const text = longDayFormat.format(new Date(`${date}T00:00:00Z`));
      return text.charAt(0).toUpperCase() + text.slice(1);
    },
  };
}

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

// Two parts of the day, told apart by colour and icon (for colour-blind users too).
// In Italy the morning runs until 13:00 (included).
const MORNING_UNTIL = "13:00";
type Period = "morning" | "evening";
const periodOf = (s: SubmissionRow): Period => ((s.bookingAt?.slice(11, 16) ?? "") <= MORNING_UNTIL ? "morning" : "evening");
const periods: Record<Period, { label: string; icon: string; pill: string; bar: string; heading: string }> = {
  morning: { label: msg("Mattina"), icon: "☀︎", pill: "bg-sky-50 text-sky-800 ring-sky-200", bar: "border-sky-400", heading: "text-sky-800" },
  evening: { label: msg("Sera"), icon: "☾", pill: "bg-violet-50 text-violet-800 ring-violet-200", bar: "border-violet-400", heading: "text-violet-800" },
};

export function CalendarPage({ projectId }: { projectId: string }) {
  const { t, intl } = useI18n();
  const formats = useFormat(calendarFormats);
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
        <PageHeader title={t("Calendario")} />
        <p className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">
          {t("Il calendario mostra le richieste con un giorno e un orario: usa il template Ristorante o Appuntamenti per averlo.")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("Calendario")}
        description={t("Prenotazioni nuove e confermate per giorno. Le rifiutate non compaiono.")}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" aria-label={t("Mese precedente")} onClick={() => goTo(shiftMonth(month, -1))}>‹</Button>
            <Button variant="secondary" onClick={() => goTo(monthStart(today()), today())}>{t("Oggi")}</Button>
            <Button variant="secondary" aria-label={t("Mese successivo")} onClick={() => goTo(shiftMonth(month, 1))}>›</Button>
          </div>
        }
      />
      {calendar.error && <div className="mb-4"><Alert>{calendar.error.message}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label={formats.month.format(new Date(`${month}T00:00:00Z`))} className="rounded-xl bg-white ring-1 ring-slate-200">
          <h2 className="border-b border-slate-200 px-4 py-3 font-semibold capitalize">{formats.month.format(new Date(`${month}T00:00:00Z`))}</h2>
          <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-medium text-slate-500">
            {formats.weekdays.map((d) => <div key={d} className="py-2">{d}</div>)}
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
                  aria-label={`${formatBooking(day, intl)}: ${t("{count} richieste", { count: items.length })}`}
                  className={cx(
                    "flex min-h-16 flex-col items-start gap-1 border-b border-r border-slate-100 p-1.5 text-left text-sm transition sm:min-h-24 sm:p-2 [&:nth-child(7n)]:border-r-0",
                    inMonth ? "bg-white hover:bg-slate-50" : "bg-slate-50/60 text-slate-400",
                    selected === day && "bg-brand-50 ring-2 ring-brand-600 ring-inset hover:bg-brand-50",
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className={cx("grid size-6 place-items-center rounded-full text-xs", day === today() && "bg-brand-700 font-semibold text-white")}>
                      {Number(day.slice(8))}
                    </span>
                    {hasNew && <span className="mr-0.5 size-1.5 shrink-0 rounded-full bg-amber-500" title={t("Da confermare")} />}
                  </span>
                  {(["morning", "evening"] as const).map((period) => {
                    const part = items.filter((s) => periodOf(s) === period);
                    if (part.length === 0) return null;
                    return (
                      <span key={period} className={cx("flex w-full items-center gap-1 rounded px-1 text-[11px] leading-5 ring-1", periods[period].pill)}>
                        <span aria-hidden>{periods[period].icon}</span>
                        <span className="font-medium">{part.length}</span>
                        <span className="hidden truncate sm:inline">{people(part) ? `· ${t("{count} p.", { count: people(part) })}` : ""}</span>
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs text-slate-500">
            <span><span className="text-sky-700">☀︎</span> {t("Mattina, fino alle {time}", { time: MORNING_UNTIL })}</span>
            <span><span className="text-violet-700">☾</span> {t("Sera, dopo le {time}", { time: MORNING_UNTIL })}</span>
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-500" /> {t("Da confermare")}</span>
          </p>
        </section>

        <DayAgenda projectId={projectId} day={selected} items={byDay.get(selected) ?? []} loading={calendar.isPending} />
      </div>
    </div>
  );
}

function DayAgenda({ projectId, day, items, loading }: { projectId: string; day: string; items: SubmissionRow[]; loading: boolean }) {
  const { t, intl } = useI18n();
  const formats = useFormat(calendarFormats);
  const countLabel = (group: SubmissionRow[]) => (people(group) ? t("{count} persone", { count: people(group) }) : t("{count} richieste", { count: group.length }));
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
    <section aria-label={t("Agenda di {day}", { day: formatBooking(day, intl) })} className="rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
      <h2 className="font-semibold">{formats.longDay(day)}</h2>
      {items.length > 0 && (
        <p className="mt-1 text-sm text-slate-500">
          {confirmed === 1 ? t("1 persona confermata") : t("{count} persone confermate", { count: confirmed })}
          {pending > 0 && <span className="text-amber-700"> · {t("{count} da confermare", { count: pending })}</span>}
        </p>
      )}
      {!loading && items.length === 0 && <p className="mt-4 text-sm text-slate-500">{t("Nessuna prenotazione per questo giorno.")}</p>}

      {(["morning", "evening"] as const).map((period) => {
        const groups = byTime.filter(([, group]) => periodOf(group[0]!) === period);
        if (groups.length === 0) return null;
        const all = groups.flatMap(([, group]) => group);
        return (
          <div key={period} className="mt-5">
            <h3 className={cx("flex items-baseline justify-between text-xs font-semibold tracking-wide uppercase", periods[period].heading)}>
              <span><span aria-hidden>{periods[period].icon}</span> {t(periods[period].label)}</span>
              <span className="font-normal normal-case">{countLabel(all)}</span>
            </h3>
            <div className="mt-2 space-y-4">
              {groups.map(([time, group]) => (
                <div key={time} className={cx("border-l-4 pl-3", periods[period].bar)}>
                  <h4 className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold">{time}</span>
                    <span className="text-xs text-slate-500">{countLabel(group)}</span>
                  </h4>
                  <ul className="mt-2 space-y-2">
                    {group.map((s) => <AgendaItem key={s.id} projectId={projectId} submission={s} />)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function AgendaItem({ projectId, submission: s }: { projectId: string; submission: SubmissionRow }) {
  const t = useT();
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (status: SubmissionStatus) => api(`/submissions/${s.id}`, { method: "PATCH", body: { status } }),
    onSuccess: () =>
      Promise.all(
        [["calendar", projectId], ["submissions", projectId], ["me"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

  return (
    <li className="rounded-lg p-2 text-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {s.contactName ?? t("Senza nome")}
            {s.isTest && <TestBadge />}
            {s.partySize ? <span className="font-normal text-slate-500"> · {t("{count} pers.", { count: s.partySize })}</span> : null}
          </p>
          {s.contactPhone && (
            <a href={`tel:${s.contactPhone.replace(/\s/g, "")}`} className="text-xs text-slate-500 hover:underline">{s.contactPhone}</a>
          )}
        </div>
        <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1", statusInfo[s.status].className)}>{t(statusInfo[s.status].label)}</span>
      </div>
      {s.answers.notes && <p className="mt-1 text-xs text-slate-600">{s.answers.notes}</p>}
      {s.status === "new" && (
        <div className="mt-2 flex gap-2">
          <Button className="px-2.5 py-1 text-xs" disabled={update.isPending} onClick={() => update.mutate("confirmed")}>{t("Conferma")}</Button>
          <Button variant="danger" className="px-2.5 py-1 text-xs" disabled={update.isPending} onClick={() => update.mutate("rejected")}>{t("Rifiuta")}</Button>
        </div>
      )}
      {update.error && <p className="mt-2 text-xs text-red-700">{update.error.message}</p>}
    </li>
  );
}
