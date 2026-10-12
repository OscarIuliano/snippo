import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { formatBooking, type AvailabilitySettings, type OpeningRange } from "@snippo/shared";
import { Alert, Button, Card, Field, Input, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { useFormat, useI18n, useT } from "../i18n";
import { availabilityQuery } from "../lib/queries";

/** Monday first, in the user's language: 1 January 2024 was a Monday. */
const weekdayNames = (intl: string) => {
  const format = new Intl.DateTimeFormat(intl, { weekday: "long", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => {
    const name = format.format(new Date(Date.UTC(2024, 0, 1 + i)));
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
};

/** Typical restaurant hours: closed on Monday, lunch and dinner the other days. */
const RESTAURANT_HOURS: OpeningRange[] = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
  { weekday, opensAt: "12:00", closesAt: "15:00" },
  { weekday, opensAt: "19:00", closesAt: "23:00" },
]);

export function AvailabilityPage({ projectId }: { projectId: string }) {
  const t = useT();
  const settings = useQuery(availabilityQuery(projectId));
  if (settings.error) return <Alert>{settings.error.message}</Alert>;
  if (!settings.data) return <p className="py-12 text-center text-sm text-slate-500">{t("Caricamento…")}</p>;

  if (settings.data.timeOptions.length === 0) {
    return (
      <div>
        <PageHeader title={t("Orari e disponibilità")} />
        <p className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">
          {t("Il template di questo widget non chiede giorno e orario: usa Ristorante o Appuntamenti per gestire la disponibilità.")}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("Orari e disponibilità")} description={t("Il widget propone solo i giorni e gli orari aperti e con posto libero.")} />
      <HoursCard projectId={projectId} settings={settings.data} />
      <ClosuresCard projectId={projectId} settings={settings.data} />
    </div>
  );
}

function HoursCard({ projectId, settings }: { projectId: string; settings: AvailabilitySettings }) {
  const t = useT();
  const WEEKDAYS = useFormat(weekdayNames);
  const queryClient = useQueryClient();
  const [hours, setHours] = useState<OpeningRange[]>(settings.hours);
  const [capacity, setCapacity] = useState(settings.slotCapacity?.toString() ?? "");
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [hours, capacity]);

  const save = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/availability`, {
        method: "PUT",
        body: { hours, slotCapacity: capacity.trim() === "" ? null : Number(capacity) },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["availability", projectId] });
      setSaved(true);
    },
  });

  const update = (i: number, patch: Partial<OpeningRange>) => setHours(hours.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const copyToAll = (weekday: number) => {
    const ranges = hours.filter((h) => h.weekday === weekday);
    setHours(WEEKDAYS.flatMap((_, d) => ranges.map((r) => ({ ...r, weekday: d }))));
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const byPeople = settings.capacityUnit === "people";

  return (
    <Card
      title={t("Orari di apertura")}
      description={t("Il widget propone questi orari: {times}. Restano solo quelli dentro una fascia di apertura.", { times: settings.timeOptions.join(", ") })}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {hours.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            <span>{t("Nessun orario impostato: il widget accetta prenotazioni tutti i giorni, a tutti gli orari.")}</span>
            <Button type="button" variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setHours(RESTAURANT_HOURS)}>
              {t("Usa orari tipici da ristorante")}
            </Button>
          </div>
        )}

        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {WEEKDAYS.map((name, weekday) => {
            const ranges = hours.map((h, i) => ({ h, i })).filter(({ h }) => h.weekday === weekday);
            return (
              <li key={name} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-3 py-3">
                <span className="w-24 pt-1.5 text-sm font-medium">{name}</span>
                <div className="flex min-w-0 flex-1 basis-60 flex-col gap-2">
                  {ranges.length === 0 && <span className="pt-1.5 text-sm text-slate-400">{t("Chiuso")}</span>}
                  {ranges.map(({ h, i }) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Input type="time" value={h.opensAt} onChange={(e) => update(i, { opensAt: e.target.value })} className="min-w-0 flex-1 sm:w-28 sm:flex-none" aria-label={t("{day}, apertura", { day: name })} required />
                      <span className="text-slate-400">–</span>
                      <Input type="time" value={h.closesAt} onChange={(e) => update(i, { closesAt: e.target.value })} className="min-w-0 flex-1 sm:w-28 sm:flex-none" aria-label={t("{day}, chiusura", { day: name })} required />
                      <Button type="button" variant="ghost" className="px-2 py-1 text-xs" aria-label={t("Rimuovi fascia di {day}", { day: name })} onClick={() => setHours(hours.filter((_, j) => j !== i))}>
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setHours([...hours, { weekday, opensAt: "19:00", closesAt: "23:00" }])}>
                    {t("+ Fascia")}
                  </Button>
                  {ranges.length > 0 && (
                    <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => copyToAll(weekday)}>
                      {t("Copia su tutti")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <Field
          label={byPeople ? t("Capienza per orario (persone)") : t("Capienza per orario (prenotazioni)")}
          hint={byPeople ? t("Quante persone al massimo per ogni orario. Vuoto = nessun limite.") : t("Quante prenotazioni al massimo per ogni orario. Vuoto = nessun limite.")}
        >
          <Input type="number" min={1} max={10000} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder={t("Nessun limite")} className="w-40" />
        </Field>

        {save.error && <Alert>{save.error.message}</Alert>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? t("Salvataggio…") : t("Salva orari")}</Button>
          {saved && <span className="text-sm text-emerald-700">{t("Salvato. Il widget li usa da subito.")}</span>}
        </div>
      </form>
    </Card>
  );
}

function ClosuresCard({ projectId, settings }: { projectId: string; settings: AvailabilitySettings }) {
  const { t, intl } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ dateFrom: "", dateTo: "", reason: "" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["availability", projectId] });
  const add = useMutation({
    mutationFn: () => api(`/projects/${projectId}/closures`, { method: "POST", body: { ...form, dateTo: form.dateTo || form.dateFrom } }),
    onSuccess: async () => {
      await refresh();
      setForm({ dateFrom: "", dateTo: "", reason: "" });
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/projects/${projectId}/closures/${id}`, { method: "DELETE" }), onSuccess: refresh });

  return (
    <Card title={t("Chiusure")} description={t("Ferie, festivi, eventi privati: in questi giorni il widget non accetta prenotazioni.")}>
      {settings.closures.length === 0 && <p className="text-sm text-slate-500">{t("Nessuna chiusura programmata.")}</p>}
      {settings.closures.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {settings.closures.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">
                  {c.dateFrom === c.dateTo ? formatBooking(c.dateFrom, intl) : `${formatBooking(c.dateFrom, intl)} → ${formatBooking(c.dateTo, intl)}`}
                </span>
                {c.reason && <span className="text-slate-500"> · {c.reason}</span>}
              </span>
              <Button variant="ghost" className="px-2 py-1 text-xs" disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>{t("Rimuovi")}</Button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="mt-4 grid gap-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end"
      >
        <Field label={t("Dal")}>
          <Input type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} required />
        </Field>
        <Field label={t("Al (compreso)")}>
          <Input type="date" value={form.dateTo} min={form.dateFrom} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} />
        </Field>
        <Field label={t("Motivo (facoltativo)")}>
          <Input value={form.reason} maxLength={100} placeholder={t("Ferie estive")} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </Field>
        <Button type="submit" variant="secondary" disabled={add.isPending}>{t("Aggiungi")}</Button>
      </form>
      {(add.error || remove.error) && <div className="mt-3"><Alert>{(add.error ?? remove.error)!.message}</Alert></div>}
    </Card>
  );
}
