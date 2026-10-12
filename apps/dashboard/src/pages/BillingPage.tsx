import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { plans, planIds, usageShare, type BillingInterval, type BillingOverview, type Plan, type PlanId } from "@snippo/shared";
import { Icon } from "../components/Icon";
import { Alert, Button, Card, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const number = new Intl.NumberFormat("it-IT");
const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });

export function BillingPage() {
  const billing = useQuery({ queryKey: ["billing"], queryFn: () => api<BillingOverview>("/billing") });

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Piano e fatturazione" description="Il tuo piano, quanto lo stai usando questo mese, il metodo di pagamento e le fatture." />
      {billing.error && <Alert>{billing.error.message}</Alert>}
      {billing.data && (
        <>
          <CurrentPlanCard billing={billing.data} />
          <PlansCard billing={billing.data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <PaymentMethodCard billing={billing.data} />
            <InvoicesCard billing={billing.data} />
          </div>
        </>
      )}
    </div>
  );
}

function CurrentPlanCard({ billing }: { billing: BillingOverview }) {
  const plan = plans[billing.plan];
  const price = billing.interval === "year" ? `${euro.format(plan.yearly)} all'anno` : `${euro.format(plan.monthly)} al mese`;
  const rows = [
    { label: "Richieste questo mese", used: billing.usage.submissionsThisMonth, limit: plan.limits.submissionsPerMonth },
    { label: "Progetti", used: billing.usage.projects, limit: plan.limits.projects },
    { label: "Persone nel team", used: billing.usage.members, limit: plan.limits.members },
  ];
  const over = rows.some((r) => r.used > r.limit);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Piano attuale</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{plan.name}</p>
          <p className="mt-1 text-sm text-slate-600">
            {billing.plan === "free" ? "Gratis, senza scadenza." : price}
            {billing.currentPeriodEnd && (
              <> · {billing.cancelAtPeriodEnd ? "termina" : "si rinnova"} il {dateFormat.format(new Date(billing.currentPeriodEnd))}</>
            )}
          </p>
        </div>
        {billing.status === "past_due" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">L'ultimo pagamento non è andato a buon fine: aggiorna il metodo di pagamento.</p>
        )}
      </div>

      <dl className="mt-6 grid gap-5 sm:grid-cols-3">
        {rows.map((r) => {
          const share = usageShare(r.used, r.limit);
          return (
            <div key={r.label}>
              <dt className="text-sm text-slate-500">{r.label}</dt>
              <dd className="mt-1 text-sm">
                <span className="text-lg font-semibold tabular-nums">{number.format(r.used)}</span>
                <span className="text-slate-500"> di {number.format(r.limit)}</span>
              </dd>
              <div className="mt-2 h-2 rounded-full bg-slate-100" role="presentation">
                <div
                  className={cx("h-2 rounded-full", share > 1 ? "bg-amber-500" : share >= 0.8 ? "bg-amber-400" : "bg-brand-600")}
                  style={{ width: `${Math.min(share, 1) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </dl>
      {over && (
        <p className="mt-4 text-sm text-amber-800">
          Sei oltre i limiti del piano {plan.name}. Per ora non blocchiamo nulla: i limiti valgono da quando saranno attivi i pagamenti.
        </p>
      )}
    </Card>
  );
}

function PlansCard({ billing }: { billing: BillingOverview }) {
  const [interval, setBillingInterval] = useState<BillingInterval>(billing.interval ?? "month");
  const [asked, setAsked] = useState<PlanId | null>(null);
  const current = planIds.indexOf(billing.plan);

  return (
    <Card title="Cambia piano" description="Puoi cambiare piano quando vuoi: la differenza viene calcolata sui giorni che restano.">
      <div role="radiogroup" aria-label="Fatturazione" className="mb-5 inline-flex rounded-lg bg-white p-1 ring-1 ring-slate-200">
        {(["month", "year"] as const).map((i) => (
          <button
            key={i}
            role="radio"
            aria-checked={interval === i}
            onClick={() => setBillingInterval(i)}
            className={cx("rounded-md px-3 py-1.5 text-sm font-medium", interval === i ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            {i === "month" ? "Mensile" : "Annuale · 2 mesi gratis"}
          </button>
        ))}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {planIds.map((id, index) => (
          <PlanOption
            key={id}
            plan={plans[id]}
            interval={interval}
            relation={index === current ? "current" : index > current ? "upgrade" : "downgrade"}
            onChoose={() => setAsked(id)}
          />
        ))}
      </ul>

      {asked && !billing.checkoutAvailable && (
        <p role="status" className="mt-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">
          I pagamenti online non sono ancora attivi: il piano {plans[asked].name} sarà disponibile a breve. Fino ad allora puoi usare Snippo senza limiti.
        </p>
      )}
    </Card>
  );
}

function PlanOption({ plan, interval, relation, onChoose }: { plan: Plan; interval: BillingInterval; relation: "current" | "upgrade" | "downgrade"; onChoose: () => void }) {
  const perMonth = interval === "year" ? plan.yearly / 12 : plan.monthly;
  return (
    <li className={cx("flex flex-col rounded-xl p-4 ring-1", relation === "current" ? "bg-brand-50/60 ring-2 ring-brand-600" : "bg-white ring-slate-200")}>
      <p className="font-semibold">{plan.name}</p>
      <p className="mt-2">
        <span className="text-2xl font-bold tracking-tight tabular-nums">{euro.format(perMonth)}</span>
        <span className="text-sm text-slate-500"> /mese</span>
      </p>
      <p className="h-5 text-xs text-slate-500">{interval === "year" && plan.yearly > 0 ? `${euro.format(plan.yearly)} all'anno` : ""}</p>
      <ul className="mt-3 flex-1 space-y-1.5 text-sm text-slate-700">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2">
            <Icon name="check" className="mt-0.5 size-4 shrink-0 text-brand-600" />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        {relation === "current" ? (
          <p className="py-2 text-center text-sm font-medium text-brand-800">Il tuo piano</p>
        ) : (
          <Button variant={relation === "upgrade" ? "primary" : "secondary"} className="w-full" onClick={onChoose}>
            {relation === "upgrade" ? `Passa a ${plan.name}` : `Torna a ${plan.name}`}
          </Button>
        )}
      </div>
    </li>
  );
}

function PaymentMethodCard({ billing }: { billing: BillingOverview }) {
  return (
    <Card title="Metodo di pagamento">
      <div className="flex items-start gap-3 text-sm text-slate-600">
        <Icon name="card" className="mt-0.5 size-5 shrink-0 text-slate-400" />
        <p>
          {billing.plan === "free"
            ? "Nessuno: sul piano Free non serve. Lo aggiungi quando passi a un piano a pagamento."
            : "Il metodo di pagamento si aggiorna da qui, appena saranno attivi i pagamenti online."}{" "}
          I dati della carta li gestisce Paddle, il nostro rivenditore: Snippo non li vede.
        </p>
      </div>
    </Card>
  );
}

function InvoicesCard({ billing }: { billing: BillingOverview }) {
  return (
    <Card title="Fatture">
      <p className="text-sm text-slate-600">
        {billing.plan === "free" ? "Ancora nessuna fattura." : "Le fatture compariranno qui dopo ogni pagamento."} Le emette Paddle, con ragione sociale, partita IVA e l'IVA del tuo paese, che inserisci al momento del pagamento.
      </p>
    </Card>
  );
}
