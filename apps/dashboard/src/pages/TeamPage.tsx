import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { canManageTeam, type Role, type TeamResponse } from "@snippo/shared";
import { Alert, Button, Card, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { meQuery, teamQuery } from "../lib/queries";

export const roleInfo: Record<Role, { label: string; description: string }> = {
  owner: { label: "Titolare", description: "Tutto, compresi team e pagamenti" },
  admin: { label: "Admin", description: "Richieste, calendario e tutte le impostazioni dei progetti" },
  operator: { label: "Operatore", description: "Richieste, calendario e statistiche, senza modificare le impostazioni" },
};

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

export function TeamPage() {
  const me = useQuery(meQuery);
  const team = useQuery(teamQuery);
  const isOwner = me.data ? canManageTeam(me.data.organization.role) : false;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Team" description="Le persone che lavorano sui progetti di questo account, e con quale ruolo." />
      {team.error && <Alert>{team.error.message}</Alert>}
      {team.data && <MembersCard team={team.data} isOwner={isOwner} />}
      {isOwner && team.data && <InviteCard pending={team.data.invitations} />}
      {!isOwner && <p className="text-sm text-slate-500">Solo il titolare può invitare persone e cambiare i ruoli.</p>}
    </div>
  );
}

function MembersCard({ team, isOwner }: { team: TeamResponse; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team"] });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) => api(`/team/members/${userId}`, { method: "PATCH", body: { role } }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (userId: string) => api(`/team/members/${userId}`, { method: "DELETE" }), onSuccess: refresh });

  return (
    <Card title="Persone">
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
        {team.members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 px-3 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {m.name} {m.isYou && <span className="font-normal text-slate-500">(tu)</span>}
              </p>
              <p className="truncate text-slate-500">{m.email}</p>
            </div>
            {isOwner && m.role !== "owner" ? (
              <>
                <select
                  value={m.role}
                  aria-label={`Ruolo di ${m.name}`}
                  disabled={changeRole.isPending}
                  onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value as Role })}
                  className="rounded-lg border-0 bg-white px-2 py-1.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600"
                >
                  <option value="admin">{roleInfo.admin.label}</option>
                  <option value="operator">{roleInfo.operator.label}</option>
                </select>
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  disabled={remove.isPending}
                  onClick={() => confirm(`Togliere ${m.name} dal team?`) && remove.mutate(m.userId)}
                >
                  Rimuovi
                </Button>
              </>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{roleInfo[m.role].label}</span>
            )}
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1 text-xs text-slate-500">
        {(Object.keys(roleInfo) as Role[]).map((r) => (
          <div key={r}>
            <dt className="inline font-medium text-slate-700">{roleInfo[r].label}:</dt> <dd className="inline">{roleInfo[r].description}</dd>
          </div>
        ))}
      </dl>
      {(changeRole.error || remove.error) && <div className="mt-3"><Alert>{(changeRole.error ?? remove.error)!.message}</Alert></div>}
    </Card>
  );
}

function InviteCard({ pending }: { pending: TeamResponse["invitations"] }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team"] });

  const create = useMutation({
    mutationFn: () => api<{ url: string }>("/team/invitations", { method: "POST", body: { role } }),
    onSuccess: async ({ url }) => {
      setLink(url);
      setCopied(false);
      await refresh();
    },
  });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/team/invitations/${id}`, { method: "DELETE" }), onSuccess: refresh });

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  const whatsapp = link && `https://wa.me/?text=${encodeURIComponent(`Ti invito a gestire le richieste su Snippo: ${link}`)}`;

  return (
    <Card title="Invita una persona" description="Crea un link e mandalo come preferisci. Funziona una sola volta e scade dopo 7 giorni.">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Ruolo" className="inline-flex rounded-lg bg-white p-1 ring-1 ring-slate-200">
          {(["operator", "admin"] as const).map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              className={cx("rounded-md px-3 py-1.5 text-sm font-medium", role === r ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100")}
            >
              {roleInfo[r].label}
            </button>
          ))}
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Creazione…" : "Crea link d'invito"}</Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{roleInfo[role].description}.</p>

      {link && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Il link si vede solo adesso: copialo e mandalo alla persona che vuoi invitare.</p>
          <p className="mt-2 font-mono text-xs break-all text-slate-800">{link}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={copy}>{copied ? "Copiato!" : "Copia link"}</Button>
            <a href={whatsapp!} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-white">
              Invia su WhatsApp
            </a>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium">Inviti in attesa</h3>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  {roleInfo[i.role].label} <span className="text-slate-500">· creato il {dateFormat.format(new Date(i.createdAt))}, scade il {dateFormat.format(new Date(i.expiresAt))}</span>
                </span>
                <Button variant="ghost" className="px-2 py-1 text-xs" disabled={revoke.isPending} onClick={() => revoke.mutate(i.id)}>Annulla</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(create.error || revoke.error) && <div className="mt-3"><Alert>{(create.error ?? revoke.error)!.message}</Alert></div>}
    </Card>
  );
}
