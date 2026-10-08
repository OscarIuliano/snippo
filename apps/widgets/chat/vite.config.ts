import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    lib: { entry: "src/main.tsx", formats: ["iife"], name: "SnippoWidget", fileName: () => "snippo.js" },
    target: "es2019",
    // Served as /v1/snippo.js: the major version is part of the URL customers embed.
    outDir: "dist/v1",
  },
});
