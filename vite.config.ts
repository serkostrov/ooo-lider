/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 8080,
    host: true,
    // Прокси локального Supabase — нужен для Dev Tunnel / доступа не с localhost:
    // браузер ходит на тот же origin (/supabase/…), Vite → 127.0.0.1:54321.
    proxy: {
      "/supabase": {
        target: "http://127.0.0.1:54321",
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/supabase/, ""),
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/components/directories/rules.ts",
        "src/components/objects/ObjectCardFields.tsx",
        "src/components/requests/FieldInput.tsx",
      ],
    },
  },
});

