import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { locales } from "@snippo/shared";
import { Icon, Logo } from "../components/Icon";
import { Alert, Button, Field, Input, Notice, cx } from "../components/ui";
import { fill, useI18n, useT, type Translate } from "../i18n";
import { authClient } from "../lib/auth";

export interface AuthSearch {
  /** Token of the invitation the user came from, to go back to it after signing in. */
  invito?: string;
  /** Set by Better Auth when a link from an email no longer works (e.g. INVALID_TOKEN). */
  error?: string;
  /** Password reset token, on the page that asks for the new password. */
  token?: string;
  /** Set after deleting the account, for the goodbye message on the login page. */
  eliminato?: string;
}

/** IT · EN in the corner of the sign-in pages; once signed in, the language is saved on the account. */
function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="absolute top-4 right-4 flex gap-1 text-xs font-medium" role="radiogroup" aria-label="Lingua / Language">
      {locales.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={locale === l}
          onClick={() => setLocale(l)}
          className={cx("rounded-md px-2 py-1 uppercase", locale === l ? "bg-white text-brand-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -right-24 size-[30rem] rounded-full bg-brand-200/50 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 size-[26rem] rounded-full bg-fuchsia-200/40 blur-3xl" />
      </div>
      <LanguageSwitch />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo className="text-xl" /></div>
        <div className="rounded-2xl bg-white/90 p-6 shadow-xl shadow-brand-900/5 ring-1 ring-slate-200 backdrop-blur sm:p-8">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        {footer && <p className="mt-6 text-center text-sm text-slate-600">{footer}</p>}
      </div>
    </main>
  );
}

const linkClass = "font-medium text-brand-700 hover:underline";

/** Where the link in the confirmation email lands: back to the invitation, or the app. */
const afterVerification = (invito?: string) => (invito ? `/accedi?invito=${encodeURIComponent(invito)}` : "/accedi");

type AuthError = { message?: string; status?: number; code?: string };

function translateAuthError(t: Translate, error: AuthError): string {
  const message = error.message ?? "";
  if (error.code === "EMAIL_NOT_VERIFIED") return t("Prima conferma l'indirizzo email: ti abbiamo appena rimandato il link.");
  if (/invalid email or password/i.test(message)) return t("Email o password non corretti.");
  if (/already exists/i.test(message)) return t("Esiste già un account con questa email.");
  if (/password.*short/i.test(message)) return t("La password deve avere almeno 8 caratteri.");
  if (/invalid password/i.test(message)) return t("La password attuale non è corretta.");
  if (/invalid token|token expired/i.test(message)) return t("Il link non è più valido: chiedine uno nuovo.");
  if (error.status === 429) return t("Troppi tentativi, riprova tra poco.");
  return t("Qualcosa è andato storto, riprova.");
}

/** Runs an auth call with pending and error state; returns true when it succeeded. */
function useAuthAction() {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<{ error: AuthError | null }>): Promise<boolean> {
    setPending(true);
    setError(null);
    const { error } = await action();
    setPending(false);
    if (error) setError(translateAuthError(t, error));
    return !error;
  }

  return { error, setError, pending, run };
}

export function LoginPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { invito, error: linkError, eliminato } = useSearch({ strict: false }) as AuthSearch;
  const { error, pending, run } = useAuthAction();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const ok = await run(() =>
      authClient.signIn.email({ email: String(form.get("email")), password: String(form.get("password")), callbackURL: afterVerification(invito) }),
    );
    if (!ok) return;
    // The cached session is the "signed out" one read on this page: drop it, or the
    // route guard would reuse it and send the user back to the login page.
    queryClient.clear();
    // Signed in from an invitation link: back to it, to join the team.
    await (invito ? navigate({ to: "/invito/$token", params: { token: invito } }) : navigate({ to: "/" }));
  }

  return (
    <AuthLayout
      title={t("Accedi")}
      subtitle={invito ? t("Accedi per unirti al team che ti ha invitato.") : t("Gestisci le richieste che arrivano dal tuo sito.")}
      footer={<>{t("Non hai un account?")} <Link to="/registrati" search={{ invito }} className={linkClass}>{t("Registrati")}</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {eliminato && !error && <Notice>{t("Il tuo account è stato eliminato. Ci dispiace vederti andare.")}</Notice>}
        {linkError && !error && <Alert>{t("Il link di conferma non è più valido. Accedi: te ne mandiamo uno nuovo.")}</Alert>}
        {error && <Alert>{error}</Alert>}
        <Field label={t("Email")}>
          <Input name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <div className="space-y-1.5">
          <Field label={t("Password")}>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <p className="text-right text-sm"><Link to="/password-dimenticata" className={linkClass}>{t("Password dimenticata?")}</Link></p>
        </div>
        <Button type="submit" className="w-full" disabled={pending}>{pending ? t("Accesso…") : t("Accedi")}</Button>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const { t, locale } = useI18n();
  const { invito } = useSearch({ strict: false }) as AuthSearch;
  const { error, pending, run } = useAuthAction();
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const ok = await run(() =>
      authClient.signUp.email({
        name: String(form.get("name")),
        email,
        password: String(form.get("password")),
        // The language chosen on this page: dashboard and emails start in it.
        locale,
        callbackURL: afterVerification(invito),
      }),
    );
    if (ok) setSentTo(email);
  }

  if (sentTo) return <CheckEmail email={sentTo} invito={invito} />;

  return (
    <AuthLayout
      title={t("Crea il tuo account")}
      subtitle={invito ? t("Crea l'account per unirti al team che ti ha invitato.") : t("Gratis, senza carta di credito. Il widget è online in pochi minuti.")}
      footer={<>{t("Hai già un account?")} <Link to="/accedi" search={{ invito }} className={linkClass}>{t("Accedi")}</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={t("Nome e cognome")}>
          <Input name="name" autoComplete="name" required minLength={2} autoFocus />
        </Field>
        <Field label={t("Email")} hint={t("Ti mandiamo un link per confermarla.")}>
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={t("Password")} hint={t("Almeno 8 caratteri.")}>
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>{pending ? t("Creazione…") : t("Crea account")}</Button>
      </form>
    </AuthLayout>
  );
}

/** After sign-up: the account exists, the address still has to be confirmed. */
function CheckEmail({ email, invito }: { email: string; invito?: string }) {
  const t = useT();
  const { error, pending, run } = useAuthAction();
  const [resent, setResent] = useState(false);

  async function resend() {
    setResent(false);
    if (await run(() => authClient.sendVerificationEmail({ email, callbackURL: afterVerification(invito) }))) setResent(true);
  }

  return (
    <AuthLayout
      title={t("Controlla la tua email")}
      subtitle={fill(t("Ti abbiamo mandato un link a {email}. Aprilo per confermare l'indirizzo ed entrare."), {
        email: <strong className="font-medium text-slate-700">{email}</strong>,
      })}
      footer={<>{t("Indirizzo sbagliato?")} <Link to="/registrati" search={{ invito }} reloadDocument className={linkClass}>{t("Registrati di nuovo")}</Link></>}
    >
      <div className="space-y-4">
        <div className="grid place-items-center rounded-xl bg-brand-50 py-6 text-brand-700">
          <Icon name="mail" className="size-10" />
        </div>
        <p className="text-sm text-slate-600">{t("Il link vale 24 ore. Se non lo trovi, guarda anche nello spam.")}</p>
        {resent && <Notice>{t("Link inviato di nuovo.")}</Notice>}
        {error && <Alert>{error}</Alert>}
        <Button variant="secondary" className="w-full" disabled={pending} onClick={resend}>{pending ? t("Invio…") : t("Rimanda il link")}</Button>
      </div>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const t = useT();
  const { error, pending, run } = useAuthAction();
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    const ok = await run(() => authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reimposta-password` }));
    if (ok) setSentTo(email);
  }

  return (
    <AuthLayout
      title={t("Password dimenticata")}
      subtitle={t("Scrivi l'email del tuo account: ti mandiamo un link per sceglierne una nuova.")}
      footer={<Link to="/accedi" className={linkClass}>{t("Torna all'accesso")}</Link>}
    >
      {sentTo ? (
        // Same answer whether the account exists or not: the page does not reveal who is registered.
        <Notice>{t("Se esiste un account per {email}, ti abbiamo mandato il link. Vale 1 ora.", { email: sentTo })}</Notice>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label={t("Email")}>
            <Input name="email" type="email" autoComplete="email" required autoFocus />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>{pending ? t("Invio…") : t("Mandami il link")}</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const t = useT();
  const { token, error: linkError } = useSearch({ strict: false }) as AuthSearch;
  const { error, setError, pending, run } = useAuthAction();
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirm"))) return setError(t("Le due password non coincidono."));
    if (await run(() => authClient.resetPassword({ newPassword, token: token! }))) setDone(true);
  }

  const invalid = linkError || !token;
  const primaryLink = "block rounded-lg bg-brand-700 px-3.5 py-2 text-center text-sm font-medium text-white hover:bg-brand-800";

  return (
    <AuthLayout
      title={t("Scegli una nuova password")}
      subtitle={t("Dopo il cambio esci da tutti i dispositivi: accedi di nuovo con la password nuova.")}
      footer={<Link to="/accedi" className={linkClass}>{t("Torna all'accesso")}</Link>}
    >
      {done ? (
        <div className="space-y-4">
          <Notice>{t("Password cambiata.")}</Notice>
          <Link to="/accedi" className={primaryLink}>{t("Accedi")}</Link>
        </div>
      ) : invalid ? (
        <div className="space-y-4">
          <Alert>{t("Il link non è più valido: vale 1 ora e funziona una sola volta.")}</Alert>
          <Link to="/password-dimenticata" className={primaryLink}>{t("Chiedi un nuovo link")}</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label={t("Nuova password")} hint={t("Almeno 8 caratteri.")}>
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />
          </Field>
          <Field label={t("Ripeti la nuova password")}>
            <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>{pending ? t("Salvataggio…") : t("Cambia password")}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
