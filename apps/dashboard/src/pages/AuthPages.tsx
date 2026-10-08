import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Field, Input } from "../components/ui";
import { authClient } from "../lib/auth";

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center text-2xl font-bold tracking-tight text-brand-700">snippo</p>
        <div className="rounded-xl bg-white p-6 ring-1 ring-stone-200 sm:p-8">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-sm text-stone-600">{footer}</p>
      </div>
    </main>
  );
}

function useAuthSubmit() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<{ error: { message?: string; status?: number } | null }>) {
    setPending(true);
    setError(null);
    const { error } = await action();
    setPending(false);
    if (error) return setError(translateAuthError(error));
    // The cached session is the "signed out" one read on this page: drop it, or the
    // route guard would reuse it and send the user back to the login page.
    queryClient.clear();
    await navigate({ to: "/" });
  }

  return { error, pending, run };
}

function translateAuthError(error: { message?: string; status?: number }): string {
  const message = error.message ?? "";
  if (/invalid email or password/i.test(message)) return "Email o password non corretti.";
  if (/already exists/i.test(message)) return "Esiste già un account con questa email.";
  if (/password.*short/i.test(message)) return "La password deve avere almeno 8 caratteri.";
  if (error.status === 429) return "Troppi tentativi, riprova tra poco.";
  return "Qualcosa è andato storto, riprova.";
}

export function LoginPage() {
  const { error, pending, run } = useAuthSubmit();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(() => authClient.signIn.email({ email: String(form.get("email")), password: String(form.get("password")) }));
  }

  return (
    <AuthLayout
      title="Accedi"
      subtitle="Gestisci le richieste che arrivano dal tuo sito."
      footer={<>Non hai un account? <Link to="/registrati" className="font-medium text-brand-700 hover:underline">Registrati</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Accesso…" : "Accedi"}</Button>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const { error, pending, run } = useAuthSubmit();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(() =>
      authClient.signUp.email({
        name: String(form.get("name")),
        email: String(form.get("email")),
        password: String(form.get("password")),
      }),
    );
  }

  return (
    <AuthLayout
      title="Crea il tuo account"
      subtitle="Gratis, senza carta di credito. Il widget è online in pochi minuti."
      footer={<>Hai già un account? <Link to="/accedi" className="font-medium text-brand-700 hover:underline">Accedi</Link></>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nome e cognome">
          <Input name="name" autoComplete="name" required minLength={2} autoFocus />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" hint="Almeno 8 caratteri.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Creazione…" : "Crea account"}</Button>
      </form>
    </AuthLayout>
  );
}
