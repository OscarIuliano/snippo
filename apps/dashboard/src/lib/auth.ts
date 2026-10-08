import { createAuthClient } from "better-auth/react";

// The API is served on the dashboard's own origin under /api (see vite.config.ts).
export const authClient = createAuthClient({ baseURL: window.location.origin, basePath: "/api/auth" });
