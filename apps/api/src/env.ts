import type { NotificationMessage } from "@snippo/shared";

export interface Bindings {
  DB: D1Database;
  NOTIFICATIONS: Queue<NotificationMessage>;
  /** Secret: wrangler secret put BETTER_AUTH_SECRET (locally in .dev.vars). Also signs action links. */
  BETTER_AUTH_SECRET: string;
  /** Public URL the dashboard reaches the auth routes on, e.g. https://app.snippo.io */
  AUTH_BASE_URL: string;
  /** Dashboard origin, trusted for auth requests and linked from notifications. */
  DASHBOARD_ORIGIN: string;
  /** Public URL of this API, used in the Conferma / Rifiuta links. */
  PUBLIC_API_URL: string;
}

export interface AppEnv {
  Bindings: Bindings;
}
