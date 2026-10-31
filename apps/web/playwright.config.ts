import { defineConfig, devices } from "@playwright/test";

import { SYNTHETIC_PLAYER_FLAG } from "./src/areas/tocar/useSyntheticPlayer";

const E2E_PORT = 4180;
const TEST_TIMEOUT_MS = 120_000;
const SERVER_START_TIMEOUT_MS = 90_000;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "aulas/**",
  timeout: TEST_TIMEOUT_MS,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js --port ${E2E_PORT} --strictPort`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS,
    env: { [SYNTHETIC_PLAYER_FLAG]: "1" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
