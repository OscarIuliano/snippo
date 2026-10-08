import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { canManageProjects } from "@snippo/shared";
import { authClient } from "../lib/auth";
import { setActiveOrganization } from "../lib/organization";
import { meQuery } from "../lib/queries";
import { Button, cx } from "./ui";

export function AppShell() {
  const me = useQuery(meQuery);
  const { projectId } = useParams({ strict: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/accedi" });
  }

  async function switchOrganization(id: string) {
    setActiveOrganization(id);
    setMenuOpen(false);
    queryClient.clear();
    await navigate({ to: "/" });
  }

  const current = me.data?.projects.find((p) => p.id === projectId);
  // Operators see what they work with; settings pages are for owners and admins.
  const manager = me.data ? canManageProjects(me.data.organization.role) : false;
  const navItems = projectId
    ? [
        { to: "/progetti/$projectId/richieste", label: "Richieste", badge: current?.newSubmissions },
        { to: "/progetti/$projectId/calendario", label: "Calendario" },
        ...(manager ? [{ to: "/progetti/$projectId/orari", label: "Orari" } as const] : []),
        { to: "/progetti/$projectId/statistiche", label: "Statistiche" },
        ...(manager
          ? ([
              { to: "/progetti/$projectId/widget", label: "Widget" },
              { to: "/progetti/$projectId/notifiche", label: "Notifiche" },
              { to: "/progetti/$projectId/installazione", label: "Installazione" },
            ] as const)
          : []),
      ]
    : [];

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 p-4">
      <Link to="/" className="px-2 text-xl font-bold tracking-tight text-brand-700">snippo</Link>

      {me.data && me.data.organizations.length > 1 && (
        <label className="block px-2">
          <span className="text-xs font-medium tracking-wide text-stone-500 uppercase">Organizzazione</span>
          <select
            className="mt-1 block w-full rounded-lg border-0 bg-white px-2 py-1.5 text-sm ring-1 ring-stone-300 focus:ring-2 focus:ring-brand-600"
            value={me.data.organization.id}
            onChange={(e) => void switchOrganization(e.target.value)}
          >
            {me.data.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}

      {me.data && me.data.projects.length > 0 && (
        <label className="block px-2">
          <span className="text-xs font-medium tracking-wide text-stone-500 uppercase">Progetto</span>
          <select
            className="mt-1 block w-full rounded-lg border-0 bg-white px-2 py-1.5 text-sm ring-1 ring-stone-300 focus:ring-2 focus:ring-brand-600"
            value={projectId ?? ""}
            onChange={(e) => {
              setMenuOpen(false);
              void navigate({ to: "/progetti/$projectId/richieste", params: { projectId: e.target.value } });
            }}
          >
            {!projectId && <option value="">Scegli…</option>}
            {me.data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <ul className="space-y-1">
        {navItems.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              params={{ projectId: projectId! }}
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
              activeProps={{ className: "bg-brand-50 font-medium text-brand-800 hover:bg-brand-50" }}
            >
              {item.label}
              {"badge" in item && item.badge ? <span className="rounded-full bg-brand-700 px-1.5 text-xs text-white">{item.badge}</span> : null}
            </Link>
          </li>
        ))}
        {manager && (
          <li>
            <Link to="/nuovo-progetto" onClick={() => setMenuOpen(false)} className="block rounded-lg px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-100">
              + Nuovo progetto
            </Link>
          </li>
        )}
      </ul>

      <ul className="space-y-1 border-t border-stone-200 pt-4">
        <li>
          <Link
            to="/team"
            onClick={() => setMenuOpen(false)}
            className="block rounded-lg px-2 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
            activeProps={{ className: "bg-brand-50 font-medium text-brand-800 hover:bg-brand-50" }}
          >
            Team
          </Link>
        </li>
      </ul>

      <div className="mt-auto border-t border-stone-200 px-2 pt-4 text-sm">
        <p className="truncate font-medium">{me.data?.user.name}</p>
        <p className="truncate text-stone-500">{me.data?.user.email}</p>
        <Button variant="ghost" className="mt-2 -ml-3" onClick={signOut}>Esci</Button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 lg:hidden">
        <Link to="/" className="text-lg font-bold text-brand-700">snippo</Link>
        <Button variant="ghost" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>Menu</Button>
      </header>
      <aside
        className={cx(
          "border-r border-stone-200 bg-white lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-60 lg:shrink-0",
          menuOpen ? "block" : "hidden",
        )}
      >
        {sidebar}
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
