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
  /** Turnstile site key and the page on our domain that runs the check. Both unset = no check. */
  TURNSTILE_SITE_KEY?: string;
  CHALLENGE_URL?: string;
  /** Secret: Turnstile secret key. When set, every submission needs a valid token. */
  TURNSTILE_SECRET?: string;
  /** Secret: WhatsApp Cloud API access token (system user of the Meta app). Unset = WhatsApp goes to the log. */
  WHATSAPP_TOKEN?: string;
  /** Phone number ID of Snippo's WhatsApp sender, from the Meta app (not the number itself). */
  WHATSAPP_PHONE_NUMBER_ID?: string;
  /** Cloudflare Email Service. Unset (development, tests) = emails go to the log. */
  EMAIL?: SendEmail;
  /** Sender address on a domain onboarded to Email Service, e.g. noreply@snippo.io */
  EMAIL_FROM?: string;
  /** Where replies to our emails land, e.g. supporto@snippo.io */
  EMAIL_REPLY_TO?: string;
  /** Submissions per widget and IP (Workers rate limiting binding). */
  SUBMIT_LIMITER?: RateLimit;
  /** Usage events per widget and IP. */
  EVENTS_LIMITER?: RateLimit;
}

export interface AppEnv {
  Bindings: Bindings;
}
