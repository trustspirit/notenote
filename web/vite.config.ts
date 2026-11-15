import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // One React copy even when Vite re-optimizes deps mid-session (Astryx imports many entry points).
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 5173 },
  test: { environment: "node" },
});
