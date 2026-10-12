import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { v7 as uuidv7 } from "uuid";
import { createDb, schema } from "@snippo/db";
import { passwordChangedMessage, resetPasswordMessage, sendEmail, verifyEmailMessage } from "./email";
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
      // No session until the address is confirmed: the sign-up sends the link, and so does a
      // sign-in attempt with an unconfirmed address (sendOnSignIn below).
      requireEmailVerification: true,
      password: { hash: hashPassword, verify: verifyPassword },
      // The link opens the dashboard page that asks for the new password.
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, resetPasswordMessage(user.email, user.name, url));
      },
      resetPasswordTokenExpiresIn: 60 * 60,
      // A reset is what you do when someone else may know the password: sign out everywhere.
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        await sendEmail(env, passwordChangedMessage(user.email, user.name, env.DASHBOARD_ORIGIN));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      // Also used for a change of address: the link then goes to the new one.
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, verifyEmailMessage(user.email, user.name, url));
      },
    },
    user: {
      // The new address must be confirmed: until then the old one stays.
      changeEmail: { enabled: true },
    },
    hooks: {
      // A password changed from the account page: the owner of the address hears about it,
      // in case it was not them.
      after: createAuthMiddleware(async (ctx) => {
        const user = ctx.context.session?.user;
        // A failed change (wrong current password) returns an APIError, which carries a status code.
        // Checked by shape: the error class can come from another copy of the library.
        const failed = typeof ctx.context.returned === "object" && ctx.context.returned !== null && "statusCode" in ctx.context.returned;
        if (ctx.path !== "/change-password" || !user || failed) return;
        await sendEmail(env, passwordChangedMessage(user.email, user.name, env.DASHBOARD_ORIGIN));
      }),
    },
    advanced: {
      database: { generateId: () => uuidv7() },
    },
    // No organization is created at sign-up: the dashboard creates a personal one on first use,
    // unless the user joins someone else's through an invitation first.
  });
}

export type Auth = ReturnType<typeof createAuth>;
