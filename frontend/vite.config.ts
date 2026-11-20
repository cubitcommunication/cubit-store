import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Single-page React app. In development Vite proxies the PHP API (php artisan
// serve) so cookies and relative URLs behave exactly as they do in production.
const API_TARGET = process.env["VITE_DEV_API"] ?? "http://127.0.0.1:8000";

/**
 * In production the PHP server writes the store's name and contact details into the page (window.__BRAND__).
 * The dev server does the same by asking the API, so the site looks the same while developing.
 */
function devBrand(): Plugin {
  return {
    name: "dev-brand",
    apply: "serve",
    async transformIndexHtml() {
      try {
        const res = await fetch(`${API_TARGET}/api/brand`);
        if (!res.ok) return [];
        const json = JSON.stringify(await res.json()).replace(/</g, "\u003c");
        return [{ tag: "script", children: `window.__BRAND__=${json};`, injectTo: "head-prepend" as const }];
      } catch {
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [
    devBrand(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
      "/sitemap.xml": { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
