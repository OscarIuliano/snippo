import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { canManageProjects } from "@snippo/shared";
import { authClient } from "../lib/auth";
import { setActiveOrganization } from "../lib/organization";
import { meQuery } from "../lib/queries";
import { Icon, Logo, type IconName } from "./Icon";
import { Button, cx } from "./ui";

type ProjectPath =
  | "/progetti/$projectId/richieste"
  | "/progetti/$projectId/calendario"
  | "/progetti/$projectId/orari"
  | "/progetti/$projectId/statistiche"
  | "/progetti/$projectId/domande"
  | "/progetti/$projectId/widget"
  | "/progetti/$projectId/notifiche"
  | "/progetti/$projectId/privacy"
  | "/progetti/$projectId/installazione";

interface NavItem {
  to: ProjectPath;
  label: string;
  icon: IconName;
  /** Settings pages: owners and admins only. */
  manage?: boolean;
}

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Ogni giorno",
    items: [
      { to: "/progetti/$projectId/richieste", label: "Richieste", icon: "inbox" },
      { to: "/progetti/$projectId/calendario", label: "Calendario", icon: "calendar" },
      { to: "/progetti/$projectId/statistiche", label: "Statistiche", icon: "chart" },
    ],
  },
  {
    title: "Impostazioni",
    items: [
      { to: "/progetti/$projectId/orari", label: "Orari", icon: "clock", manage: true },
      { to: "/progetti/$projectId/domande", label: "Domande", icon: "list", manage: true },
      { to: "/progetti/$projectId/widget", label: "Widget", icon: "palette", manage: true },
      { to: "/progetti/$projectId/notifiche", label: "Notifiche", icon: "bell", manage: true },
      { to: "/progetti/$projectId/privacy", label: "Privacy", icon: "shield", manage: true },
      { to: "/progetti/$projectId/installazione", label: "Installazione", icon: "code", manage: true },
    ],
  },
];

const LAST_PROJECT = "snippo:last-project";
const navLink = "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900";
const navActive = { className: "bg-brand-50 font-medium text-brand-800 hover:bg-brand-50 hover:text-brand-800" };

export function AppShell() {
  const me = useQuery(meQuery);
  const params = useParams({ strict: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Outside a project (e.g. the Team page) the menu keeps the last project, so its pages stay one click away.
  const [lastProject, setLastProject] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_PROJECT);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!params.projectId) return;
    setLastProject(params.projectId);
    try {
      localStorage.setItem(LAST_PROJECT, params.projectId);
    } catch {
      // Storage blocked: the menu just forgets it.
    }
  }, [params.projectId]);

  const projects = me.data?.projects ?? [];
  const projectId = params.projectId ?? (projects.some((p) => p.id === lastProject) ? lastProject : projects[0]?.id);
  const current = projects.find((p) => p.id === projectId);
  const manager = me.data ? canManageProjects(me.data.organization.role) : false;

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

  const close = () => setMenuOpen(false);
  const select = "mt-1 block w-full rounded-lg border-0 bg-white px-2.5 py-2 text-sm font-medium ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-600";

  const sidebar = (
    <nav className="flex h-full flex-col gap-5 p-4">
      <Link to="/" className="hidden px-1 lg:block"><Logo /></Link>

      {me.data && me.data.organizations.length > 1 && (
        <label className="block px-1">
          <span className="text-xs font-medium text-slate-500">Organizzazione</span>
          <select className={select} value={me.data.organization.id} onChange={(e) => void switchOrganization(e.target.value)}>
            {me.data.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}

      {projects.length > 0 && projectId && (
        <label className="block px-1">
          <span className="text-xs font-medium text-slate-500">Progetto</span>
          <select
            className={select}
            value={projectId}
            onChange={(e) => {
              close();
              void navigate({ to: "/progetti/$projectId/richieste", params: { projectId: e.target.value } });
            }}
          >
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {projectId &&
        NAV.map((group) => {
          const items = group.items.filter((item) => !item.manage || manager);
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="px-2.5 text-xs font-medium text-slate-400">{group.title}</p>
              <ul className="mt-1 space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} params={{ projectId }} onClick={close} className={navLink} activeProps={navActive}>
                      <Icon name={item.icon} className="size-4.5 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.to.endsWith("richieste") && current?.newSubmissions ? (
                        <span className="rounded-full bg-brand-600 px-1.5 text-xs font-medium text-white">{current.newSubmissions}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

      <div>
        <p className="px-2.5 text-xs font-medium text-slate-400">Account</p>
        <ul className="mt-1 space-y-0.5">
          <li>
            <Link to="/team" onClick={close} className={navLink} activeProps={navActive}>
              <Icon name="users" className="size-4.5 shrink-0" /> Team
            </Link>
          </li>
          {manager && (
            <li>
              <Link to="/nuovo-progetto" onClick={close} className={navLink} activeProps={navActive}>
                <Icon name="plus" className="size-4.5 shrink-0" /> Nuovo progetto
              </Link>
            </li>
          )}
        </ul>
      </div>

      <div className="mt-auto flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
          {me.data?.user.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-medium">{me.data?.user.name}</p>
          <p className="truncate text-xs text-slate-500">{me.data?.user.email}</p>
        </div>
        <Button variant="ghost" className="px-2 py-1.5" title="Esci" aria-label="Esci" onClick={signOut}>
          <Icon name="logout" className="size-4.5" />
        </Button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link to="/"><Logo /></Link>
        <Button variant="ghost" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "Chiudi" : "Menu"}</Button>
      </header>
      <aside
        className={cx(
          "border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-64 lg:shrink-0 lg:overflow-y-auto",
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
