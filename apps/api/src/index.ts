import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./env";
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

app.notFound((c) => problem(c, 404, "Risorsa non trovata"));
app.onError((err, c) => {
  console.error(err);
  return problem(c, 500, "Errore interno");
});

export default app;
