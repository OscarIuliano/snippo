import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { locales, type AccountDeletionPlan, type Locale } from "@snippo/shared";
import { Alert, Button, Card, Field, Input, Notice, PageHeader, cx } from "../components/ui";
import { fill, useFormat, useI18n, useT, type Translate } from "../i18n";
import { api } from "../lib/api";
import { authClient } from "../lib/auth";
import { setActiveOrganization } from "../lib/organization";
import { meQuery, sessionQuery } from "../lib/queries";
import type { AuthSearch } from "./AuthPages";

type AuthError = { message?: string; status?: number; code?: string };

function accountError(t: Translate, error: AuthError): string {
  const message = error.message ?? "";
  if (error.code === "OWNER_OF_TEAM") return t("Prima passa la titolarità delle organizzazioni in cui ci sono altre persone.");
  if (/invalid password/i.test(message)) return t("La password attuale non è corretta.");
  if (/password.*short/i.test(message)) return t("La nuova password deve avere almeno 8 caratteri.");
  if (/already exists|already in use/i.test(message)) return t("Questo indirizzo è già usato da un altro account.");
  if (/same/i.test(message)) return t("È già il tuo indirizzo.");
  if (error.status === 429) return t("Troppi tentativi, riprova tra poco.");
  return t("Qualcosa è andato storto, riprova.");
}

/** Better Auth answers { data, error }: an error becomes a thrown one, in the user's language, for useMutation. */
function useUnwrap() {
  const t = useT();
  return async <T,>(call: Promise<{ data: T; error: AuthError | null }>): Promise<T> => {
    const { data, error } = await call;
    if (error) throw new Error(accountError(t, error));
    return data;
  };
}

export function AccountPage() {
  const t = useT();
  const me = useQuery(meQuery);
  const { error: linkError } = useSearch({ strict: false }) as AuthSearch;
  if (!me.data) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("Il tuo account")} description={t("I tuoi dati di accesso. Valgono per tutti i progetti e i team di cui fai parte.")} />
      {linkError && <Alert>{t("Il link di conferma della nuova email non è più valido: chiedine un altro qui sotto.")}</Alert>}
      <ProfileCard name={me.data.user.name} />
      <LanguageCard />
      <EmailCard email={me.data.user.email} />
      <PasswordCard />
      <SessionsCard />
      <DeleteAccountCard />
    </div>
  );
}

function useRefreshUser() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: meQuery.queryKey }), queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })]);
}

function ProfileCard({ name }: { name: string }) {
  const t = useT();
  const unwrap = useUnwrap();
  const refresh = useRefreshUser();
  const [value, setValue] = useState(name);
  const save = useMutation({ mutationFn: () => unwrap(authClient.updateUser({ name: value.trim() })), onSuccess: refresh });

  return (
    <Card title={t("Profilo")} description={t("Il nome che vede il tuo team.")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-56 flex-1">
          <Field label={t("Nome e cognome")}>
            <Input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="name" required minLength={2} maxLength={100} />
          </Field>
        </div>
        <Button type="submit" disabled={save.isPending || value.trim() === name}>{t("Salva")}</Button>
      </form>
      {save.isSuccess && value.trim() === name && <p className="mt-3 text-sm text-emerald-700">{t("Salvato.")}</p>}
      {save.error && <div className="mt-3"><Alert>{save.error.message}</Alert></div>}
    </Card>
  );
}

const languageNames: Record<Locale, string> = { it: "Italiano", en: "English" };

/** The language switches at once; saving it on the account makes it follow the user on every device. */
function LanguageCard() {
  const { t, locale, setLocale } = useI18n();
  const unwrap = useUnwrap();
  const refresh = useRefreshUser();
  const save = useMutation({ mutationFn: (next: Locale) => unwrap(authClient.updateUser({ locale: next })), onSuccess: refresh });

  function choose(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    save.mutate(next);
  }

  return (
    <Card title={t("Lingua")} description={t("La lingua della dashboard e delle email sul tuo account.")}>
      <div role="radiogroup" aria-label={t("Lingua")} className="inline-flex rounded-lg bg-white p-1 ring-1 ring-slate-200">
        {locales.map((l) => (
          <button
            key={l}
            role="radio"
            aria-checked={locale === l}
            disabled={save.isPending}
            onClick={() => choose(l)}
            className={cx("rounded-md px-3 py-1.5 text-sm font-medium", locale === l ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            {languageNames[l]}
          </button>
        ))}
      </div>
      {save.error && <div className="mt-3"><Alert>{save.error.message}</Alert></div>}
    </Card>
  );
}

function EmailCard({ email }: { email: string }) {
  const t = useT();
  const unwrap = useUnwrap();
  const [value, setValue] = useState("");
  const change = useMutation({
    mutationFn: (newEmail: string) => unwrap(authClient.changeEmail({ newEmail, callbackURL: "/account" })),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    change.mutate(value.trim().toLowerCase());
  }

  return (
    <Card title={t("Email")} description={t("Per accedere e per ricevere gli avvisi sull'account.")}>
      <p className="text-sm">{fill(t("Indirizzo attuale: {email}"), { email: <strong className="font-medium">{email}</strong> })}</p>
      {change.isSuccess ? (
        <div className="mt-4 space-y-3">
          <Notice>
            {fill(t("Ti abbiamo mandato un link a {newEmail}. L'indirizzo cambia quando lo apri; fino ad allora resta {email}."), {
              newEmail: <strong className="font-medium">{change.variables}</strong>,
              email,
            })}
          </Notice>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => change.reset()}>{t("Usa un altro indirizzo")}</Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Field label={t("Nuovo indirizzo")}>
              <Input type="email" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="email" required placeholder={t("nome@esempio.it")} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={change.isPending}>{change.isPending ? t("Invio…") : t("Cambia email")}</Button>
        </form>
      )}
      {change.error && <div className="mt-3"><Alert>{change.error.message}</Alert></div>}
    </Card>
  );
}

function PasswordCard() {
  const t = useT();
  const unwrap = useUnwrap();
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
    <Card title={t("Password")} description={t("Dopo il cambio ti mandiamo un'email di avviso, nel caso non fossi stato tu.")}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t("Password attuale")}>
          <Input name="current" type="password" autoComplete="current-password" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Nuova password")} hint={t("Almeno 8 caratteri.")}>
            <Input name="new" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <Field label={t("Ripeti la nuova password")} error={mismatch ? t("Le due password non coincidono.") : null}>
            <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="revoke" defaultChecked className="accent-brand-700" />
          {t("Esci dagli altri dispositivi")}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={change.isPending}>{change.isPending ? t("Salvataggio…") : t("Cambia password")}</Button>
          {change.isSuccess && <span className="text-sm text-emerald-700">{t("Password cambiata.")}</span>}
        </div>
        {change.error && <Alert>{change.error.message}</Alert>}
      </form>
    </Card>
  );
}

/** "Chrome su Mac" from a user agent: enough to recognise a device, no library needed. */
function describeDevice(t: Translate, userAgent: string | null | undefined): string {
  if (!userAgent) return t("Dispositivo sconosciuto");
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(userAgent) ? "iPhone" : /Android/.test(userAgent) ? "Android" : /Mac OS X/.test(userAgent) ? "Mac" : /Windows/.test(userAgent) ? "Windows" : /Linux/.test(userAgent) ? "Linux" : null;
  return os ? t("{browser} su {os}", { browser, os }) : browser;
}

function SessionsCard() {
  const t = useT();
  const unwrap = useUnwrap();
  const dateFormat = useFormat((intl) => new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
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
    <Card title={t("Dispositivi")} description={t("Dove hai fatto l'accesso. Se non riconosci un dispositivo, fallo uscire e cambia la password.")}>
      {sessions.error && <Alert>{sessions.error.message}</Alert>}
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 empty:hidden">
        {list.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-40 flex-1">
              <span className="font-medium">{describeDevice(t, s.userAgent)}</span>
              {s.token === currentToken && (
                <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-100">{t("questo dispositivo")}</span>
              )}
              <span className="block text-xs text-slate-500">{t("Ultimo uso {date}", { date: dateFormat.format(new Date(s.updatedAt)) })}</span>
            </span>
            {s.token !== currentToken && (
              <Button variant="ghost" className="px-2 py-1 text-xs" disabled={revoke.isPending} onClick={() => revoke.mutate(s.token)}>{t("Fai uscire")}</Button>
            )}
          </li>
        ))}
      </ul>
      {others > 0 && (
        <Button variant="secondary" className="mt-4" disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
          {t("Esci da tutti gli altri ({count})", { count: others })}
        </Button>
      )}
      {(revoke.error || revokeOthers.error) && <div className="mt-3"><Alert>{(revoke.error ?? revokeOthers.error)!.message}</Alert></div>}
    </Card>
  );
}

function DeleteAccountCard() {
  const t = useT();
  const unwrap = useUnwrap();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const plan = useQuery({ queryKey: ["account-deletion"], queryFn: () => api<AccountDeletionPlan>("/account/deletion") });
  const [understood, setUnderstood] = useState(false);
  const remove = useMutation({
    mutationFn: (password: string) => unwrap(authClient.deleteUser({ password })),
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/accedi", search: { eliminato: "1" } });
    },
  });

  async function openTeam(organizationId: string) {
    setActiveOrganization(organizationId);
    queryClient.clear();
    await navigate({ to: "/team" });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    remove.mutate(String(new FormData(e.currentTarget).get("password")));
  }

  const blocking = plan.data?.blocking ?? [];
  const deleted = plan.data?.deleted ?? [];

  return (
    <Card title={t("Elimina account")} description={t("Cancella per sempre il tuo account e i tuoi dati. Non si può annullare.")}>
      {plan.error && <Alert>{plan.error.message}</Alert>}
      {plan.data && blocking.length > 0 && (
        <div className="space-y-3 text-sm">
          <p>{t("Prima di eliminare l'account, passa la titolarità a un'altra persona del team, da Team → Rendi titolare:")}</p>
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {blocking.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className="min-w-40 flex-1">
                  <span className="font-medium">{o.name}</span>
                  <span className="text-slate-500"> · {t("{count} persone", { count: o.members })}</span>
                </span>
                <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => openTeam(o.id)}>{t("Apri il team")}</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.data && blocking.length === 0 && (
        <form onSubmit={onSubmit} className="space-y-4 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            <li>{t("Escono tutti i tuoi dispositivi e il tuo profilo viene cancellato.")}</li>
            {deleted.map((o) => (
              <li key={o.id}>
                {fill(
                  o.projects === 1
                    ? t("L'organizzazione {name} viene eliminata con il suo progetto, le richieste ricevute e le statistiche. I widget smettono di funzionare sui siti.")
                    : t("L'organizzazione {name} viene eliminata con i suoi {count} progetti, le richieste ricevute e le statistiche. I widget smettono di funzionare sui siti.", {
                        count: o.projects,
                      }),
                  { name: <strong className="font-medium">{o.name}</strong> },
                )}
              </li>
            ))}
            <li>{t("Dai team di altre persone esci soltanto: i loro progetti restano.")}</li>
          </ul>
          <Field label={t("Password")}>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <label className="flex items-start gap-2 text-slate-700">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 accent-red-700" />
            {t("Ho capito che i dati non si possono recuperare.")}
          </label>
          <Button type="submit" variant="danger" disabled={!understood || remove.isPending}>
            {remove.isPending ? t("Eliminazione…") : t("Elimina definitivamente")}
          </Button>
          {remove.error && <Alert>{remove.error.message}</Alert>}
        </form>
      )}
    </Card>
  );
}
