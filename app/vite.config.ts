import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Local stand-in for Vercel's same-origin /api routing — see scripts/dev-api-server.ts
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
