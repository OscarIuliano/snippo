import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { AccountDeletionBlocked, prepareAccountDeletion } from "./account";
import { v7 as uuidv7 } from "uuid";
import { count, createDb, schema } from "@snippo/db";
import { isLocale, isSignupSource } from "@snippo/shared";
import { accountEmail, sendEmail, signupNoticeEmail } from "./email";
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
        await sendEmail(env, accountEmail("reset", user, url));
      },
      resetPasswordTokenExpiresIn: 60 * 60,
      // A reset is what you do when someone else may know the password: sign out everywhere.
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        await sendEmail(env, accountEmail("passwordChanged", user, env.DASHBOARD_ORIGIN));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      // Also used for a change of address: the link then goes to the new one.
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, accountEmail("verify", user, url));
      },
    },
    user: {
      // Language of the dashboard and of these emails; set at sign-up and from the account page.
      additionalFields: {
        locale: { type: "string", required: false, defaultValue: "it", input: true },
        // Campaign of the link the user arrived from, sent once with the sign-up (see the before hook).
        signupSource: { type: "string", required: false, input: true },
      },
      // The new address must be confirmed: until then the old one stays.
      changeEmail: { enabled: true },
      deleteUser: {
        enabled: true,
        // Organizations owned with other people block the deletion; the ones left empty go with the account.
        beforeDelete: async (user) => {
          try {
            await prepareAccountDeletion(env.DB, user.id);
          } catch (error) {
            if (!(error instanceof AccountDeletionBlocked)) throw error;
            // The dashboard shows its own text for this code, with the organizations from /account/deletion.
            throw new APIError("BAD_REQUEST", {
              code: "OWNER_OF_TEAM",
              message: `Sei titolare di ${error.organizations.map((o) => o.name).join(", ")}, con altre persone nel team: prima passa la titolarità.`,
            });
          }
        },
        afterDelete: async (user) => {
          await sendEmail(env, accountEmail("deleted", user));
        },
      },
    },
    hooks: {
      // Deleting the account always asks for the password, even from a fresh session.
      before: createAuthMiddleware(async (ctx) => {
        if ((ctx.path === "/sign-up/email" || ctx.path === "/update-user") && ctx.body?.locale !== undefined && !isLocale(ctx.body.locale)) {
          throw new APIError("BAD_REQUEST", { code: "INVALID_LOCALE", message: "Lingua non supportata" });
        }
        if (ctx.path === "/sign-up/email" && ctx.body?.signupSource !== undefined && !isSignupSource(ctx.body.signupSource)) {
          throw new APIError("BAD_REQUEST", { code: "INVALID_SIGNUP_SOURCE", message: "Provenienza non valida" });
        }
        // Set at sign-up only: it says where the account came from, so it never changes later.
        if (ctx.path === "/update-user" && ctx.body?.signupSource !== undefined) {
          throw new APIError("BAD_REQUEST", { code: "SIGNUP_SOURCE_READ_ONLY", message: "La provenienza non si può modificare" });
        }
        if (ctx.path === "/delete-user" && !ctx.body?.password) {
          throw new APIError("BAD_REQUEST", { code: "PASSWORD_REQUIRED", message: "Serve la password per eliminare l'account" });
        }
      }),
      // A password changed from the account page: the owner of the address hears about it,
      // in case it was not them.
      after: createAuthMiddleware(async (ctx) => {
        const user = ctx.context.session?.user;
        // A failed change (wrong current password) returns an APIError, which carries a status code.
        // Checked by shape: the error class can come from another copy of the library.
        const failed = typeof ctx.context.returned === "object" && ctx.context.returned !== null && "statusCode" in ctx.context.returned;
        if (ctx.path !== "/change-password" || !user || failed) return;
        await sendEmail(env, accountEmail("passwordChanged", user, env.DASHBOARD_ORIGIN));
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // The owner hears about every new account. A failure here must never block the sign-up.
          after: async (user) => {
            if (!env.SIGNUP_NOTIFY_TO) return;
            try {
              const [row] = await db.select({ total: count() }).from(schema.users);
              await sendEmail(env, signupNoticeEmail(env.SIGNUP_NOTIFY_TO, user as typeof user & { signupSource?: string | null }, row?.total ?? 0));
            } catch (error) {
              console.error("[signup notice]", error);
            }
          },
        },
      },
    },
    advanced: {
      database: { generateId: () => uuidv7() },
    },
    // No organization is created at sign-up: the dashboard creates a personal one on first use,
    // unless the user joins someone else's through an invitation first.
  });
}

export type Auth = ReturnType<typeof createAuth>;
