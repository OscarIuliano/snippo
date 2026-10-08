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
  },
});
