import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
          // Turnstile off by default (it comes from .dev.vars locally): its tests turn it on per request.
          TURNSTILE_SECRET: "",
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "../../packages/db/migrations")),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    // Better Auth answers a failed sign-in or a redirect by throwing an APIError, and under
    // workerd it also surfaces as an unhandled rejection even though the response is correct.
    // Ignore exactly those: any other unhandled error still fails the run.
    onUnhandledError(error) {
      const isApiError = error.name === "APIError" || /^APIError/.test(String((error as { stack?: string }).stack ?? ""));
      // false = ignore this error; undefined = default handling.
      if (isApiError) return false;
    },
  },
});
