import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const DEV_PORT = 5180;
const PREVIEW_PORT = 4180;
const FIVE_MEGABYTES = 5 * 1024 * 1024;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Fretless",
        short_name: "Fretless",
        description: "Estudo de violino com afinador, rotina e músicas.",
        lang: "pt-BR",
        theme_color: "#faf6ef",
        background_color: "#faf6ef",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,svg,woff2}"],
        maximumFileSizeToCacheInBytes: FIVE_MEGABYTES,
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: DEV_PORT, strictPort: true },
  preview: { port: PREVIEW_PORT, strictPort: true },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@fretless/core"] },
  assetsInclude: ["**/*.wasm"],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
