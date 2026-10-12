import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatBooking, type ProjectStats } from "@snippo/shared";
import { Alert, Card, PageHeader, cx } from "../components/ui";
import { useFormat, useI18n, useT } from "../i18n";
import { statsQuery } from "../lib/queries";

// Emphasis form: the requests (the point) in the brand colour, the opens (context) in gray.
// Both validated: contrast >= 3:1 on white, worst colour-blind ΔE 11.7 (tritan).
const COLOR_REQUESTS = "#4f46e5";
const COLOR_OPENS = "#64748b";
const PERIODS = [7, 30, 90] as const;

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

export function StatsPage({ projectId }: { projectId: string }) {
  const { t, intl } = useI18n();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const stats = useQuery(statsQuery(projectId, days));
  const data = stats.data;

  return (
    <div className="max-w-4xl">
      <PageHeader title={t("Statistiche")} description={t("Quante persone aprono il widget, quante arrivano in fondo e dove si fermano.")} />

      <div role="radiogroup" aria-label={t("Periodo")} className="mb-6 inline-flex rounded-lg bg-white p-1 ring-1 ring-slate-200">
        {PERIODS.map((p) => (
          <button
            key={p}
            role="radio"
            aria-checked={days === p}
            onClick={() => setDays(p)}
            className={cx("rounded-md px-3 py-1.5 text-sm font-medium", days === p ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            <span className="hidden sm:inline">{t("Ultimi {count} giorni", { count: p })}</span>
            <span className="sm:hidden">{t("{count} giorni", { count: p })}</span>
          </button>
        ))}
      </div>

      {stats.error && <Alert>{stats.error.message}</Alert>}
      {!data && !stats.error && <p className="py-12 text-center text-sm text-slate-500">{t("Caricamento…")}</p>}
      {data && (
        // Refetch keeps the frame: the previous numbers stay, dimmed, until the new ones arrive.
        <div className={cx("space-y-6 transition-opacity", stats.isPlaceholderData && "opacity-60")}>
          <KpiRow totals={data.totals} />
          <Card title={t("Andamento giornaliero")} description={t("Dal {from} al {to}.", { from: formatBooking(data.from, intl), to: formatBooking(data.to, intl) })}>
            <TrendChart daily={data.daily} />
            <DailyTable daily={data.daily} />
          </Card>
          <Card title={t("Dove si fermano")} description={t("Persone arrivate a ogni domanda, su quelle che hanno iniziato la conversazione.")}>
            <StepFunnel steps={data.steps} starts={data.totals.starts} />
          </Card>
        </div>
      )}
    </div>
  );
}

function KpiRow({ totals }: { totals: ProjectStats["totals"] }) {
  const t = useT();
  const numberFormat = useFormat((intl) => new Intl.NumberFormat(intl));
  const tiles = [
    { label: t("Aperture del widget"), value: numberFormat.format(totals.opens) },
    { label: t("Conversazioni avviate"), value: numberFormat.format(totals.starts), note: t("{percent} delle aperture", { percent: percent(totals.starts, totals.opens) }) },
    { label: t("Richieste inviate"), value: numberFormat.format(totals.submissions), note: t("{count} confermate", { count: numberFormat.format(totals.confirmed) }) },
    { label: t("Conversione"), value: percent(totals.submissions, totals.opens), note: t("richieste su aperture") },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">{tile.label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{tile.value}</p>
          {tile.note && <p className="mt-0.5 text-xs text-slate-500">{tile.note}</p>}
        </div>
      ))}
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round axis maximum and ticks: 0, step, 2·step… with step in 1, 2, 5 × 10ⁿ. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

const shortDate = (date: string, intl: string) => formatBooking(date, intl).replace(/^\S+ /, ""); // "12 dic" / "12 Dec"

function TrendChart({ daily }: { daily: ProjectStats["daily"] }) {
  const { t, intl } = useI18n();
  const numberFormat = useFormat((intl) => new Intl.NumberFormat(intl));
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const m = { top: 12, right: 40, bottom: 28, left: 36 };
  const ticks = niceTicks(Math.max(...daily.map((d) => Math.max(d.opens, d.submissions))));
  const yMax = ticks.at(-1)!;
  const innerW = Math.max(width - m.left - m.right, 10);
  const innerH = height - m.top - m.bottom;
  const x = (i: number) => m.left + (daily.length === 1 ? innerW / 2 : (i / (daily.length - 1)) * innerW);
  const y = (v: number) => m.top + innerH - (v / yMax) * innerH;
  const path = (key: "opens" | "submissions") => daily.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[key])}`).join("");
  const last = daily.length - 1;
  // About one date every 60px, so a phone shows fewer of them instead of overlapping.
  const labelEvery = Math.ceil(daily.length / Math.max(2, Math.min(6, Math.floor(innerW / 60))));

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - m.left) / innerW) * last);
    setHover(Math.min(Math.max(i, 0), last));
  }
  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowLeft") setHover((h) => Math.max((h ?? last) - 1, 0));
    if (e.key === "ArrowRight") setHover((h) => Math.min((h ?? last) + 1, last));
  }

  const series = [
    { key: "submissions" as const, label: t("Richieste inviate"), color: COLOR_REQUESTS },
    { key: "opens" as const, label: t("Aperture"), color: COLOR_OPENS },
  ];
  const point = hover !== null ? daily[hover] : null;

  return (
    <div>
      <ul className="mb-3 flex gap-4 text-xs text-slate-600" aria-label={t("Legenda")}>
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={t("Aperture e richieste inviate per giorno. Usa le frecce per scorrere i giorni.")}
            tabIndex={0}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setHover(null)}
            className="block touch-pan-y focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={m.left} x2={width - m.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" />
                <text x={m.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#64748b" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {numberFormat.format(tick)}
                </text>
              </g>
            ))}
            {daily.map((d, i) =>
              (i % labelEvery === 0 && x(last) - x(i) >= 72) || i === last ? (
                <text key={d.date} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} fontSize="11" fill="#64748b">
                  {shortDate(d.date, intl)}
                </text>
              ) : null,
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + innerH} stroke="#94a3b8" />}
            {[...series].reverse().map((s) => (
              <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {series.map((s) => {
              const i = hover ?? last;
              return (
                <circle key={s.key} cx={x(i)} cy={y(daily[i]![s.key])} r={4} fill={s.color} stroke="#ffffff" strokeWidth={2} />
              );
            })}
            {hover === null &&
              series.map((s) => (
                <text key={s.key} x={x(last) + 8} y={y(daily[last]![s.key]) + 4} fontSize="11" fontWeight="600" fill="#334155">
                  {numberFormat.format(daily[last]![s.key])}
                </text>
              ))}
          </svg>
        )}
        {point && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200"
            style={x(hover) > width / 2 ? { right: width - x(hover) + 12 } : { left: x(hover) + 12 }}
          >
            <p className="mb-1 font-medium text-slate-500">{formatBooking(point.date, intl)}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                <span className="font-semibold text-slate-900">{numberFormat.format(point[s.key])}</span>
                <span className="text-slate-500">{s.label.toLowerCase()}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DailyTable({ daily }: { daily: ProjectStats["daily"] }) {
  const { t, intl } = useI18n();
  const numberFormat = useFormat((intl) => new Intl.NumberFormat(intl));
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-slate-600 hover:text-slate-900">{t("Mostra i dati in tabella")}</summary>
      <div className="mt-3 max-h-72 overflow-auto rounded-lg ring-1 ring-slate-200">
        <table className="w-full text-left" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">{t("Giorno")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Aperture")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Avviate")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Richieste")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...daily].reverse().map((d) => (
              <tr key={d.date}>
                <td className="px-3 py-1.5">{formatBooking(d.date, intl)}</td>
                <td className="px-3 py-1.5 text-right">{numberFormat.format(d.opens)}</td>
                <td className="px-3 py-1.5 text-right">{numberFormat.format(d.starts)}</td>
                <td className="px-3 py-1.5 text-right">{numberFormat.format(d.submissions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function StepFunnel({ steps, starts }: { steps: ProjectStats["steps"]; starts: number }) {
  const t = useT();
  const numberFormat = useFormat((intl) => new Intl.NumberFormat(intl));
  if (starts === 0) return <p className="text-sm text-slate-500">{t("Ancora nessuna conversazione in questo periodo.")}</p>;

  // The biggest fall from one question to the next: where the flow loses most people.
  let worst = -1;
  let worstDrop = 0;
  steps.forEach((s, i) => {
    const before = i === 0 ? starts : steps[i - 1]!.reached;
    const drop = before > 0 ? (before - s.reached) / before : 0;
    if (drop > worstDrop && !(i > 0 && steps[i - 1]!.reached === 0)) [worst, worstDrop] = [i, drop];
  });

  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const share = Math.min(s.reached / starts, 1);
        return (
          <li key={s.key} title={t("{count} persone ({percent})", { count: numberFormat.format(s.reached), percent: percent(s.reached, starts) })}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-slate-700">{s.prompt}</span>
              <span className="shrink-0 font-medium text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                {numberFormat.format(s.reached)} <span className="font-normal text-slate-500">· {percent(s.reached, starts)}</span>
              </span>
            </div>
            <div className="h-4 w-full rounded-r bg-slate-100">
              <div className="h-4 rounded-r" style={{ width: `${share * 100}%`, background: COLOR_REQUESTS }} />
            </div>
            {i === worst && worstDrop >= 0.15 && (
              <p className="mt-1 text-xs text-slate-600">
                ↓ {t("Qui si perde il {percent}% di chi era arrivato alla domanda precedente: è il passo da semplificare.", { percent: Math.round(worstDrop * 100) })}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
