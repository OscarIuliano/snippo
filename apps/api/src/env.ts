export interface AppEnv {
  Bindings: {
    DB: D1Database;
    /** Secret: wrangler secret put BETTER_AUTH_SECRET (locally in .dev.vars). */
    BETTER_AUTH_SECRET: string;
    /** Public URL the dashboard reaches the auth routes on, e.g. https://app.snippo.io */
    AUTH_BASE_URL: string;
    /** Dashboard origin, trusted for auth requests. */
    DASHBOARD_ORIGIN: string;
  };
}
