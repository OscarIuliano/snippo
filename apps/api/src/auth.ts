import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { v7 as uuidv7 } from "uuid";
import { createDb, schema } from "@snippo/db";
import type { AppEnv } from "./env";
import { hashPassword, verifyPassword } from "./password";

export function createAuth(env: AppEnv["Bindings"]) {
  const db = createDb(env.DB);

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.AUTH_BASE_URL,
    basePath: "/api/auth",
    trustedOrigins: [env.DASHBOARD_ORIGIN],
    database: drizzleAdapter(db, { provider: "sqlite", usePlural: true, schema }),
    emailAndPassword: {
      enabled: true,
      // Email verification arrives with the email provider (Resend).
      requireEmailVerification: false,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    advanced: {
      database: { generateId: () => uuidv7() },
    },
    // No organization is created at sign-up: the dashboard creates a personal one on first use,
    // unless the user joins someone else's through an invitation first.
  });
}

export type Auth = ReturnType<typeof createAuth>;
