import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { InvitationInfo } from "@snippo/shared";
import { Logo } from "../components/Icon";
import { Alert, Button } from "../components/ui";
import { activeLocale, fill, translate, useT } from "../i18n";
import { ApiError } from "../lib/api";
import { setActiveOrganization } from "../lib/organization";
import { sessionQuery } from "../lib/queries";
import { roleInfo } from "./TeamPage";

async function call<T>(path: string, method = "GET"): Promise<T> {
  const res = await fetch(`/api/invitations/${path}`, { method, credentials: "same-origin", headers: { "Accept-Language": activeLocale() } });
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { title?: string };
    throw new ApiError(res.status, problem.title ?? translate(activeLocale(), "Errore {status}", { status: res.status }));
  }
  return res.json();
}

/** Landing page of an invitation link: join directly when signed in, else sign in or up first. */
export function InvitePage({ token }: { token: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useQuery(sessionQuery);
  const info = useQuery({ queryKey: ["invitation", token], queryFn: () => call<InvitationInfo>(token), retry: false });

  const join = useMutation({
    mutationFn: () => call<{ organizationId: string }>(`${token}/accept`, "POST"),
    onSuccess: async ({ organizationId }) => {
      setActiveOrganization(organizationId);
      queryClient.clear();
      await navigate({ to: "/" });
    },
  });

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo className="text-xl" /></div>
        <div className="rounded-2xl bg-white p-6 shadow-xl shadow-brand-900/5 ring-1 ring-slate-200 sm:p-8">
          {info.isPending && <p className="text-sm text-slate-500">{t("Caricamento…")}</p>}
          {info.error && (
            <>
              <h1 className="text-lg font-semibold">{t("Invito non valido")}</h1>
              <p className="mt-2 text-sm text-slate-500">{t("Il link non esiste o è sbagliato. Chiedi a chi ti ha invitato di crearne uno nuovo.")}</p>
            </>
          )}
          {info.data && info.data.status !== "valid" && (
            <>
              <h1 className="text-lg font-semibold">{info.data.status === "used" ? t("Invito già usato") : t("Invito scaduto")}</h1>
              <p className="mt-2 text-sm text-slate-500">{t("Chiedi a {name} di crearne uno nuovo.", { name: info.data.invitedBy })}</p>
            </>
          )}
          {info.data?.status === "valid" && (
            <>
              <h1 className="text-lg font-semibold">{t("Unisciti a {name}", { name: info.data.organizationName })}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {fill(t("{inviter} ti ha invitato come {role}: {description}."), {
                  inviter: info.data.invitedBy,
                  role: <strong>{t(roleInfo[info.data.role].label).toLowerCase()}</strong>,
                  description: t(roleInfo[info.data.role].description).toLowerCase(),
                })}
              </p>
              <div className="mt-6 space-y-3">
                {join.error && <Alert>{join.error.message}</Alert>}
                {session.data ? (
                  <Button className="w-full" disabled={join.isPending} onClick={() => join.mutate()}>
                    {join.isPending ? t("Un momento…") : t("Unisciti come {email}", { email: session.data.user.email })}
                  </Button>
                ) : (
                  <>
                    <Link to="/registrati" search={{ invito: token }} className="block rounded-lg bg-brand-700 px-3.5 py-2 text-center text-sm font-medium text-white hover:bg-brand-800">
                      {t("Crea un account")}
                    </Link>
                    <Link to="/accedi" search={{ invito: token }} className="block rounded-lg px-3.5 py-2 text-center text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
                      {t("Ho già un account")}
                    </Link>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
