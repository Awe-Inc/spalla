import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { ADMIN } from "./e2e/aulas/contas";
import { SYNTHETIC_PLAYER_FLAG } from "./src/areas/tocar/useSyntheticPlayer";

const WEB_PORT = 4180;
const API_PORT = 3410;
const TEST_TIMEOUT_MS = 240_000;
const SERVER_START_TIMEOUT_MS = 120_000;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;

const dataDir = process.env.SPALLA_E2E_DATA ?? mkdtempSync(join(tmpdir(), "spalla-e2e-"));
process.env.SPALLA_E2E_DATA = dataDir;

const apiEnv = {
  NODE_ENV: "development",
  HOST: "127.0.0.1",
  PORT: String(API_PORT),
  PGLITE_DIR: join(dataDir, "pglite"),
  FILES_DIR: join(dataDir, "files"),
  CORS_ORIGINS: `${WEB_ORIGIN},http://127.0.0.1:${WEB_PORT}`,
  RATE_LIMIT_AUTH_MAX: "500",
  RATE_LIMIT_MAX: "5000",
  ADMIN_EMAIL: ADMIN.email,
  ADMIN_NAME: ADMIN.name,
  ADMIN_PASSWORD: ADMIN.password,
};

export default defineConfig({
  testDir: "./e2e/aulas",
  timeout: TEST_TIMEOUT_MS,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "e2e-relatorio", open: "never" }]],
  use: {
    baseURL: WEB_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--mute-audio", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  webServer: [
    {
      command: "node ./node_modules/tsx/dist/cli.mjs src/adminCli.ts && node ./node_modules/tsx/dist/cli.mjs src/server.ts",
      cwd: resolve(import.meta.dirname, "../api"),
      url: `${API_ORIGIN}/health`,
      reuseExistingServer: false,
      timeout: SERVER_START_TIMEOUT_MS,
      env: apiEnv,
    },
    {
      command: `node ./node_modules/vite/bin/vite.js --port ${WEB_PORT} --strictPort`,
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: SERVER_START_TIMEOUT_MS,
      env: { [SYNTHETIC_PLAYER_FLAG]: "1", VITE_API_URL: API_ORIGIN },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
