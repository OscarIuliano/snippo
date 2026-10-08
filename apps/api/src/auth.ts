import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { v7 as uuidv7 } from "uuid";
import { createDb, memberships, organizations, schema } from "@snippo/db";
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
    databaseHooks: {
      user: {
        create: {
          // Every new user gets their own organization, as owner.
          after: async (user) => {
            const organizationId = uuidv7();
            await db.batch([
              db.insert(organizations).values({ id: organizationId, name: user.name, slug: organizationId }),
              db.insert(memberships).values({ organizationId, userId: user.id, role: "owner" }),
            ]);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
