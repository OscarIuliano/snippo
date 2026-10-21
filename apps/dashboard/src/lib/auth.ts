import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

// The API is served on the dashboard's own origin under /api (see vite.config.ts).
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  // The user's language, stored by the API next to name and email, and the campaign of the sign-up link.
  plugins: [
    inferAdditionalFields({
      user: { locale: { type: "string", required: false }, signupSource: { type: "string", required: false } },
    }),
  ],
});
