import type { QueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, createRootRouteWithContext, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "./components/AppShell";
import { CalendarPage } from "./pages/CalendarPage";
import { meQuery, sessionQuery } from "./lib/queries";
import { LoginPage, SignupPage } from "./pages/AuthPages";
import { InboxPage } from "./pages/InboxPage";
import { InstallPage } from "./pages/InstallPage";
import { NewProjectPage } from "./pages/NewProjectPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { WidgetPage } from "./pages/WidgetPage";

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });

// Public pages: a signed-in user goes straight to the app.
const guestOnly = async ({ context }: { context: { queryClient: QueryClient } }) => {
  if (await context.queryClient.ensureQueryData(sessionQuery)) throw redirect({ to: "/" });
};

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/accedi", beforeLoad: guestOnly, component: LoginPage });
const signupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/registrati", beforeLoad: guestOnly, component: SignupPage });

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
  return first ? (
    <Navigate to="/progetti/$projectId/richieste" params={{ projectId: first.id }} replace />
  ) : (
    <Navigate to="/nuovo-progetto" replace />
  );
}

const homeRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: HomeRedirect });
const newProjectRoute = createRoute({ getParentRoute: () => appRoute, path: "/nuovo-progetto", component: NewProjectPage });

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
  appRoute.addChildren([homeRoute, newProjectRoute, projectRoute.addChildren([inboxRoute, calendarRoute, widgetRoute, notificationsRoute, installRoute])]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent" });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
