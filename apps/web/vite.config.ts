import { copyFileSync, createReadStream, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { isPdfjsAssetFile, PDFJS_ASSET_EXTENSIONS, PDFJS_ASSET_FOLDERS, PDFJS_ASSETS_DIR } from "./src/pdf/assets";

const DEV_PORT = 5180;
const PREVIEW_PORT = 4180;
const FIVE_MEGABYTES = 5 * 1024 * 1024;
const base = process.env.BASE_PATH ?? "/";

function spaFallbackForStaticHosts(): Plugin {
  let outDir = "dist";
  return {
    name: "fretless:spa-fallback",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      copyFileSync(join(outDir, "index.html"), join(outDir, "404.html"));
    },
  };
}

const PDFJS_DIR = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const PDFJS_ASSET_CONTENT_TYPES: Record<string, string> = { ".wasm": "application/wasm", ".js": "text/javascript", ".ttf": "font/ttf" };
const PRECACHED_EXTENSIONS = ["js", "mjs", "css", "html", "wasm", "svg", "woff2", "woff", "mxl", ...PDFJS_ASSET_EXTENSIONS];

function pdfjsAssetPath(requestUrl: string | undefined): string | null {
  try {
    const relativePath = decodeURIComponent((requestUrl ?? "/").split("?")[0] ?? "/");
    const filePath = resolve(PDFJS_DIR, `.${relativePath}`);
    const isInsideAssets = PDFJS_ASSET_FOLDERS.some((folder) => filePath.startsWith(join(PDFJS_DIR, folder) + sep));
    return isInsideAssets && isPdfjsAssetFile(filePath) && statSync(filePath, { throwIfNoEntry: false })?.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function pdfjsAssets(): Plugin {
  return {
    name: "fretless:pdfjs-assets",
    generateBundle() {
      for (const folder of PDFJS_ASSET_FOLDERS) {
        for (const fileName of readdirSync(join(PDFJS_DIR, folder)).filter(isPdfjsAssetFile)) {
          this.emitFile({ type: "asset", fileName: `${PDFJS_ASSETS_DIR}/${folder}/${fileName}`, source: readFileSync(join(PDFJS_DIR, folder, fileName)) });
        }
      }
    },
    configureServer(server) {
      const mount = `${base.replace(/\/$/, "")}/${PDFJS_ASSETS_DIR}`;
      server.middlewares.use(mount, (request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
          next();
          return;
        }
        const filePath = pdfjsAssetPath(request.url);
        if (!filePath) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader("Content-Type", PDFJS_ASSET_CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream");
        response.setHeader("Content-Length", statSync(filePath).size);
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        pipeline(createReadStream(filePath), response, () => response.destroy());
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    spaFallbackForStaticHosts(),
    pdfjsAssets(),
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
        start_url: base,
        scope: base,
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: [`**/*.{${PRECACHED_EXTENSIONS.join(",")}}`],
        maximumFileSizeToCacheInBytes: FIVE_MEGABYTES,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/amostras/"),
            handler: "CacheFirst",
            options: { cacheName: "amostras", expiration: { maxEntries: 64 }, cacheableResponse: { statuses: [200] } },
          },
        ],
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
