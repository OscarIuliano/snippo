import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { InvitationInfo } from "@snippo/shared";
import { Alert, Button } from "../components/ui";
import { ApiError } from "../lib/api";
import { setActiveOrganization } from "../lib/organization";
import { sessionQuery } from "../lib/queries";
import { roleInfo } from "./TeamPage";

async function call<T>(path: string, method = "GET"): Promise<T> {
  const res = await fetch(`/api/invitations/${path}`, { method, credentials: "same-origin" });
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { title?: string };
    throw new ApiError(res.status, problem.title ?? `Errore ${res.status}`);
  }
  return res.json();
}

/** Landing page of an invitation link: join directly when signed in, else sign in or up first. */
export function InvitePage({ token }: { token: string }) {
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
        <p className="mb-8 text-center text-2xl font-bold tracking-tight text-brand-700">snippo</p>
        <div className="rounded-xl bg-white p-6 ring-1 ring-stone-200 sm:p-8">
          {info.isPending && <p className="text-sm text-stone-500">Caricamento…</p>}
          {info.error && (
            <>
              <h1 className="text-lg font-semibold">Invito non valido</h1>
              <p className="mt-2 text-sm text-stone-500">Il link non esiste o è sbagliato. Chiedi a chi ti ha invitato di crearne uno nuovo.</p>
            </>
          )}
          {info.data && info.data.status !== "valid" && (
            <>
              <h1 className="text-lg font-semibold">{info.data.status === "used" ? "Invito già usato" : "Invito scaduto"}</h1>
              <p className="mt-2 text-sm text-stone-500">Chiedi a {info.data.invitedBy} di crearne uno nuovo.</p>
            </>
          )}
          {info.data?.status === "valid" && (
            <>
              <h1 className="text-lg font-semibold">Unisciti a {info.data.organizationName}</h1>
              <p className="mt-2 text-sm text-stone-600">
                {info.data.invitedBy} ti ha invitato come <strong>{roleInfo[info.data.role].label.toLowerCase()}</strong>: {roleInfo[info.data.role].description.toLowerCase()}.
              </p>
              <div className="mt-6 space-y-3">
                {join.error && <Alert>{join.error.message}</Alert>}
                {session.data ? (
                  <Button className="w-full" disabled={join.isPending} onClick={() => join.mutate()}>
                    {join.isPending ? "Un momento…" : `Unisciti come ${session.data.user.email}`}
                  </Button>
                ) : (
                  <>
                    <Link to="/registrati" search={{ invito: token }} className="block rounded-lg bg-brand-700 px-3.5 py-2 text-center text-sm font-medium text-white hover:bg-brand-800">
                      Crea un account
                    </Link>
                    <Link to="/accedi" search={{ invito: token }} className="block rounded-lg px-3.5 py-2 text-center text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
                      Ho già un account
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
