import type { QueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, createRootRouteWithContext, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "./components/AppShell";
import { AvailabilityPage } from "./pages/AvailabilityPage";
import { CalendarPage } from "./pages/CalendarPage";
import { FlowEditorPage } from "./pages/FlowEditorPage";
import { meQuery, sessionQuery } from "./lib/queries";
import { LoginPage, SignupPage } from "./pages/AuthPages";
import { InboxPage } from "./pages/InboxPage";
import { InvitePage } from "./pages/InvitePage";
import { InstallPage } from "./pages/InstallPage";
import { NewProjectPage } from "./pages/NewProjectPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { StatsPage } from "./pages/StatsPage";
import { TeamPage } from "./pages/TeamPage";
import { WidgetPage } from "./pages/WidgetPage";

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });

interface AuthSearch {
  /** Token of the invitation the user came from, to go back to it after signing in. */
  invito?: string;
}
const authSearch = (search: Record<string, unknown>): AuthSearch => (typeof search.invito === "string" ? { invito: search.invito } : {});

// Public pages: a signed-in user goes straight to the app (or back to the invitation).
const guestOnly = async ({ context, search }: { context: { queryClient: QueryClient }; search: AuthSearch }) => {
  if (!(await context.queryClient.ensureQueryData(sessionQuery))) return;
  throw search.invito ? redirect({ to: "/invito/$token", params: { token: search.invito } }) : redirect({ to: "/" });
};

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/accedi", validateSearch: authSearch, beforeLoad: guestOnly, component: LoginPage });
const signupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/registrati", validateSearch: authSearch, beforeLoad: guestOnly, component: SignupPage });
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invito/$token",
  component: function Invite() {
    return <InvitePage token={inviteRoute.useParams().token} />;
  },
});

// Private area.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context }) => {
    if (!(await context.queryClient.ensureQueryData(sessionQuery))) throw redirect({ to: "/accedi" });
  },
  component: AppShell,
});

function HomeRedirect() {
  const me = useQuery(meQuery);
  if (!me.data) return null;
  const first = me.data.projects[0];
  if (first) return <Navigate to="/progetti/$projectId/richieste" params={{ projectId: first.id }} replace />;
  // An operator cannot create projects: the team page says who to ask.
  return me.data.organization.role === "operator" ? <Navigate to="/team" replace /> : <Navigate to="/nuovo-progetto" replace />;
}

const homeRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: HomeRedirect });
const newProjectRoute = createRoute({ getParentRoute: () => appRoute, path: "/nuovo-progetto", component: NewProjectPage });
const teamRoute = createRoute({ getParentRoute: () => appRoute, path: "/team", component: TeamPage });

const projectRoute = createRoute({ getParentRoute: () => appRoute, path: "/progetti/$projectId" });
const inboxRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/richieste",
  component: function Inbox() {
    return <InboxPage projectId={inboxRoute.useParams().projectId} />;
  },
});
const calendarRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/calendario",
  component: function Calendar() {
    return <CalendarPage projectId={calendarRoute.useParams().projectId} />;
  },
});
const availabilityRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/orari",
  component: function Availability() {
    return <AvailabilityPage projectId={availabilityRoute.useParams().projectId} />;
  },
});
const statsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/statistiche",
  component: function Stats() {
    return <StatsPage projectId={statsRoute.useParams().projectId} />;
  },
});
const questionsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/domande",
  component: function Questions() {
    return <FlowEditorPage projectId={questionsRoute.useParams().projectId} />;
  },
});
const widgetRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/widget",
  component: function Widget() {
    return <WidgetPage projectId={widgetRoute.useParams().projectId} />;
  },
});
const notificationsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/notifiche",
  component: function Notifications() {
    return <NotificationsPage projectId={notificationsRoute.useParams().projectId} />;
  },
});
const installRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/installazione",
  component: function Install() {
    return <InstallPage projectId={installRoute.useParams().projectId} />;
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  signupRoute,
  inviteRoute,
  appRoute.addChildren([homeRoute, newProjectRoute, teamRoute, projectRoute.addChildren([inboxRoute, calendarRoute, availabilityRoute, statsRoute, questionsRoute, widgetRoute, notificationsRoute, installRoute])]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent" });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
