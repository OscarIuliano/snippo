import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { normalizePhone, type ChannelRow, type ChannelType, type DeliveryRow } from "@snippo/shared";
import { Icon, type IconName } from "../components/Icon";
import { Alert, Button, Card, Input, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { channelsQuery, deliveriesQuery } from "../lib/queries";

const channelLabel: Record<ChannelType, { name: string; icon: IconName; placeholder: string }> = {
  email: { name: "Email", icon: "mail", placeholder: "prenotazioni@trattoria.it" },
  whatsapp: { name: "WhatsApp", icon: "phone", placeholder: "333 123 4567" },
};

/** "+393331234567" -> "+39 333 123 4567" (Italian numbers; others stay as they are). */
const formatTarget = (target: string) => {
  const it = target.match(/^\+39(\d{3})(\d{3})(\d{3,4})$/);
  return it ? `+39 ${it[1]} ${it[2]} ${it[3]}` : target;
};

const deliveryStatus: Record<DeliveryRow["status"], { label: string; className: string }> = {
  pending: { label: "In invio", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  sent: { label: "Inviata", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  failed: { label: "Non riuscita", className: "bg-red-50 text-red-800 ring-red-200" },
};

const timeFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function NotificationsPage({ projectId }: { projectId: string }) {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Notifiche" description="Chi viene avvisato quando arriva una nuova richiesta, via email o WhatsApp." />
      {import.meta.env.DEV && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">
          Ambiente di sviluppo: le notifiche non vengono spedite, finiscono nel log dell'API (il terminale di <code>pnpm dev</code>), con i link Conferma e Rifiuta.
        </p>
      )}
      <ChannelsCard projectId={projectId} />
      <DeliveriesCard projectId={projectId} />
    </div>
  );
}

function ChannelsCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const channels = useQuery(channelsQuery(projectId));
  const [type, setType] = useState<ChannelType>("email");
  const [target, setTarget] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["channels", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["deliveries", projectId] }),
    ]);
  const add = useMutation({ mutationFn: () => api<ChannelRow>(`/projects/${projectId}/channels`, { method: "POST", body: { type, target } }), onSuccess: refresh });
  const toggle = useMutation({
    mutationFn: (ch: ChannelRow) => api(`/projects/${projectId}/channels/${ch.id}`, { method: "PATCH", body: { isActive: !ch.isActive } }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/projects/${projectId}/channels/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const test = useMutation({ mutationFn: (id: string) => api(`/projects/${projectId}/channels/${id}/test`, { method: "POST" }), onSuccess: refresh });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const valid = type === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.trim()) : normalizePhone(target) !== null;
    if (!valid) return setFormError(type === "email" ? "Email non valida" : "Numero non valido: usa il prefisso internazionale se non è italiano (+44…)");
    setFormError(null);
    add.mutate(undefined, { onSuccess: () => setTarget("") });
  }

  const error = channels.error ?? add.error ?? toggle.error ?? remove.error ?? test.error;

  return (
    <Card title="Destinatari" description="Ogni destinatario attivo riceve tutte le nuove richieste del progetto, con i pulsanti Conferma e Rifiuta.">
      {channels.data?.length === 0 && <p className="text-sm text-slate-500">Nessun destinatario: le richieste arrivano solo in dashboard.</p>}
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 empty:hidden">
        {channels.data?.map((ch) => (
          <li key={ch.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
            <Icon name={channelLabel[ch.type].icon} className="size-4.5 shrink-0 text-slate-400" />
            <span className={cx("min-w-0 flex-1 truncate", !ch.isActive && "text-slate-400 line-through")}>
              <span className="sr-only">{channelLabel[ch.type].name}: </span>
              {formatTarget(ch.target)}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={ch.isActive} onChange={() => toggle.mutate(ch)} className="accent-brand-700" />
              Attivo
            </label>
            <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={!ch.isActive || test.isPending} onClick={() => test.mutate(ch.id)}>
              Invia prova
            </Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" disabled={remove.isPending} onClick={() => confirm(`Rimuovere ${ch.target}?`) && remove.mutate(ch.id)}>
              Rimuovi
            </Button>
          </li>
        ))}
      </ul>

      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ChannelType)}
          aria-label="Tipo di canale"
          className="rounded-lg border-0 bg-white px-2 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600"
        >
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          type={type === "email" ? "email" : "tel"}
          placeholder={channelLabel[type].placeholder}
          aria-label={type === "email" ? "Indirizzo email" : "Numero WhatsApp"}
          className="min-w-48 flex-1"
          required
        />
        <Button type="submit" variant="secondary" disabled={add.isPending}>Aggiungi</Button>
      </form>
      {(formError || error) && <div className="mt-3"><Alert>{formError ?? error?.message}</Alert></div>}
    </Card>
  );
}

function DeliveriesCard({ projectId }: { projectId: string }) {
  const deliveries = useQuery(deliveriesQuery(projectId));

  return (
    <Card title="Ultimi invii" description="Le 20 notifiche più recenti. Quelle non riuscite vengono ritentate in automatico.">
      {deliveries.data?.length === 0 && <p className="text-sm text-slate-500">Ancora nessuna notifica inviata.</p>}
      {deliveries.data && deliveries.data.length > 0 && (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium sm:px-6">Quando</th>
                <th className="px-2 py-2 font-medium">Destinatario</th>
                <th className="px-2 py-2 font-medium">Richiesta</th>
                <th className="px-5 py-2 font-medium sm:px-6">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveries.data.map((d) => (
                <tr key={d.id}>
                  <td className="px-5 py-2 whitespace-nowrap text-slate-500 sm:px-6">{timeFormat.format(new Date(d.createdAt))}</td>
                  <td className="max-w-56 px-2 py-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Icon name={channelLabel[d.channelType].icon} className="size-4 shrink-0 text-slate-400" />
                      <span className="truncate">{formatTarget(d.target)}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-600">{d.submissionId ? (d.contactName ?? "Senza nome") : "Prova"}</td>
                  <td className="px-5 py-2 sm:px-6">
                    <span title={d.lastError ?? undefined} className={cx("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1", deliveryStatus[d.status].className)}>
                      {deliveryStatus[d.status].label}
                      {d.status === "failed" && d.attempts > 1 ? ` (${d.attempts} tentativi)` : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
