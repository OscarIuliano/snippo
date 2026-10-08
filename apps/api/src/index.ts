import { Hono } from "hono";
import { cors } from "hono/cors";
import type { NotificationMessage } from "@snippo/shared";
import { actionRoutes } from "./actions";
import { createAuth } from "./auth";
import { dashboardRoutes } from "./dashboard";
import type { AppEnv } from "./env";
import { handleNotificationBatch } from "./notifications/consumer";
import { problem } from "./problem";
import { widgetRoutes } from "./widget";

const app = new Hono<AppEnv>();

// The widget runs on customers' sites: CORS accepts any origin here,
// each widget route then checks the Origin against the project's domains.
app.use(
  "/v1/widget/*",
  cors({ origin: (origin) => origin, allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["Content-Type", "Idempotency-Key"], maxAge: 86400 }),
);

app.get("/health", (c) => c.json({ ok: true }));
app.route("/v1/widget", widgetRoutes);
app.route("/v1/actions", actionRoutes);

// Dashboard: served under /api on the dashboard's own origin (Vite proxy in dev,
// a Workers route on app.snippo.io in production), so no CORS and first-party cookies.
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
app.route("/api/v1", dashboardRoutes);

app.notFound((c) => problem(c, 404, "Risorsa non trovata"));
app.onError((err, c) => {
  console.error(err);
  return problem(c, 500, "Errore interno");
});

export default {
  fetch: app.fetch,
  // Consumer of the notifications queue: same Worker, same code and bindings as the API.
  queue: (batch: MessageBatch<NotificationMessage>, env: AppEnv["Bindings"]) => handleNotificationBatch(batch, env),
} satisfies ExportedHandler<AppEnv["Bindings"], NotificationMessage>;
