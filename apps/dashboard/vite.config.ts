import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    // Same-origin API in dev, like the Workers route on app.snippo.io in production.
    proxy: { "/api": "http://localhost:8787" },
  },
});
