import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Input, Notice, PageHeader } from "../components/ui";
import { authClient } from "../lib/auth";
import { meQuery, sessionQuery } from "../lib/queries";
import type { AuthSearch } from "./AuthPages";

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Better Auth answers { data, error }: an error becomes a thrown one, for useMutation. */
async function unwrap<T>(call: Promise<{ data: T; error: { message?: string; status?: number } | null }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new Error(accountError(error));
  return data;
}

function accountError(error: { message?: string; status?: number }): string {
  const message = error.message ?? "";
  if (/invalid password/i.test(message)) return "La password attuale non è corretta.";
  if (/password.*short/i.test(message)) return "La nuova password deve avere almeno 8 caratteri.";
  if (/already exists|already in use/i.test(message)) return "Questo indirizzo è già usato da un altro account.";
  if (/same/i.test(message)) return "È già il tuo indirizzo.";
  if (error.status === 429) return "Troppi tentativi, riprova tra poco.";
  return "Qualcosa è andato storto, riprova.";
}

export function AccountPage() {
  const me = useQuery(meQuery);
  const { error: linkError } = useSearch({ strict: false }) as AuthSearch;
  if (!me.data) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Il tuo account" description="I tuoi dati di accesso. Valgono per tutti i progetti e i team di cui fai parte." />
      {linkError && <Alert>Il link di conferma della nuova email non è più valido: chiedine un altro qui sotto.</Alert>}
      <ProfileCard name={me.data.user.name} />
      <EmailCard email={me.data.user.email} />
      <PasswordCard />
      <SessionsCard />
    </div>
  );
}

function useRefreshUser() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: meQuery.queryKey }), queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })]);
}

function ProfileCard({ name }: { name: string }) {
  const refresh = useRefreshUser();
  const [value, setValue] = useState(name);
  const save = useMutation({ mutationFn: () => unwrap(authClient.updateUser({ name: value.trim() })), onSuccess: refresh });

  return (
    <Card title="Profilo" description="Il nome che vede il tuo team.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-56 flex-1">
          <Field label="Nome e cognome">
            <Input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="name" required minLength={2} maxLength={100} />
          </Field>
        </div>
        <Button type="submit" disabled={save.isPending || value.trim() === name}>Salva</Button>
      </form>
      {save.isSuccess && value.trim() === name && <p className="mt-3 text-sm text-emerald-700">Salvato.</p>}
      {save.error && <div className="mt-3"><Alert>{save.error.message}</Alert></div>}
    </Card>
  );
}

function EmailCard({ email }: { email: string }) {
  const [value, setValue] = useState("");
  const change = useMutation({
    mutationFn: (newEmail: string) => unwrap(authClient.changeEmail({ newEmail, callbackURL: "/account" })),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    change.mutate(value.trim().toLowerCase());
  }

  return (
    <Card title="Email" description="Per accedere e per ricevere gli avvisi sull'account.">
      <p className="text-sm">
        Indirizzo attuale: <strong className="font-medium">{email}</strong>
      </p>
      {change.isSuccess ? (
        <div className="mt-4 space-y-3">
          <Notice>
            Ti abbiamo mandato un link a <strong className="font-medium">{change.variables}</strong>. L'indirizzo cambia quando lo apri; fino ad allora resta {email}.
          </Notice>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => change.reset()}>Usa un altro indirizzo</Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Field label="Nuovo indirizzo">
              <Input type="email" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="email" required placeholder="nome@esempio.it" />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={change.isPending}>{change.isPending ? "Invio…" : "Cambia email"}</Button>
        </form>
      )}
      {change.error && <div className="mt-3"><Alert>{change.error.message}</Alert></div>}
    </Card>
  );
}

function PasswordCard() {
  const queryClient = useQueryClient();
  const [mismatch, setMismatch] = useState(false);
  const change = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string; revokeOtherSessions: boolean }) => unwrap(authClient.changePassword(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("new"));
    const mismatched = newPassword !== String(form.get("confirm"));
    setMismatch(mismatched);
    if (mismatched) return;
    change.mutate(
      { currentPassword: String(form.get("current")), newPassword, revokeOtherSessions: form.get("revoke") === "on" },
      { onSuccess: () => formElement.reset() },
    );
  }

  return (
    <Card title="Password" description="Dopo il cambio ti mandiamo un'email di avviso, nel caso non fossi stato tu.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Password attuale">
          <Input name="current" type="password" autoComplete="current-password" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nuova password" hint="Almeno 8 caratteri.">
            <Input name="new" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <Field label="Ripeti la nuova password" error={mismatch ? "Le due password non coincidono." : null}>
            <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="revoke" defaultChecked className="accent-brand-700" />
          Esci dagli altri dispositivi
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={change.isPending}>{change.isPending ? "Salvataggio…" : "Cambia password"}</Button>
          {change.isSuccess && <span className="text-sm text-emerald-700">Password cambiata.</span>}
        </div>
        {change.error && <Alert>{change.error.message}</Alert>}
      </form>
    </Card>
  );
}

/** "Chrome su Mac" from a user agent: enough to recognise a device, no library needed. */
function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "Dispositivo sconosciuto";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(userAgent) ? "iPhone" : /Android/.test(userAgent) ? "Android" : /Mac OS X/.test(userAgent) ? "Mac" : /Windows/.test(userAgent) ? "Windows" : /Linux/.test(userAgent) ? "Linux" : null;
  return os ? `${browser} su ${os}` : browser;
}

function SessionsCard() {
  const queryClient = useQueryClient();
  const current = useQuery(sessionQuery);
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => unwrap(authClient.listSessions()) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["sessions"] });
  const revoke = useMutation({ mutationFn: (token: string) => unwrap(authClient.revokeSession({ token })), onSuccess: refresh });
  const revokeOthers = useMutation({ mutationFn: () => unwrap(authClient.revokeOtherSessions()), onSuccess: refresh });

  const currentToken = current.data?.session.token;
  const list = [...(sessions.data ?? [])].sort((a, b) => (a.token === currentToken ? -1 : b.token === currentToken ? 1 : +new Date(b.updatedAt) - +new Date(a.updatedAt)));
  const others = list.filter((s) => s.token !== currentToken).length;

  return (
    <Card title="Dispositivi" description="Dove hai fatto l'accesso. Se non riconosci un dispositivo, fallo uscire e cambia la password.">
      {sessions.error && <Alert>{sessions.error.message}</Alert>}
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 empty:hidden">
        {list.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-40 flex-1">
              <span className="font-medium">{describeDevice(s.userAgent)}</span>
              {s.token === currentToken && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-100">questo dispositivo</span>}
              <span className="block text-xs text-slate-500">Ultimo uso {dateFormat.format(new Date(s.updatedAt))}</span>
            </span>
            {s.token !== currentToken && (
              <Button variant="ghost" className="px-2 py-1 text-xs" disabled={revoke.isPending} onClick={() => revoke.mutate(s.token)}>Fai uscire</Button>
            )}
          </li>
        ))}
      </ul>
      {others > 0 && (
        <Button variant="secondary" className="mt-4" disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
          Esci da tutti gli altri ({others})
        </Button>
      )}
      {(revoke.error || revokeOthers.error) && <div className="mt-3"><Alert>{(revoke.error ?? revokeOthers.error)!.message}</Alert></div>}
    </Card>
  );
}
