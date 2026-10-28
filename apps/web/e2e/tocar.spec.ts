import { expect, test } from "@playwright/test";

const EXERCISE_ID = "scales.1oct.69";
const EXERCISE_TITLE = "Lá maior - uma oitava";
const SETTINGS_STORAGE_KEY = "fretless-settings";
const ONBOARDED_SETTINGS = JSON.stringify({ state: { onboardedAt: 1 }, version: 0 });
const RUN_TIMEOUT_MS = 90_000;
const MINIMUM_ACCURACY_PCT = 70;

test("o jogador sintético toca um exercício do começo ao resultado", async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );

  await page.goto(`/tocar/${EXERCISE_ID}?jogador=sintetico`);

  await expect(page.getByRole("heading", { name: EXERCISE_TITLE })).toBeVisible();
  await expect(page.getByText("Jogador sintético")).toBeVisible();

  await page.getByRole("button", { name: "Estou de fone" }).click();
  await page.getByRole("button", { name: "Começar" }).click();

  await expect(page.getByRole("region", { name: "Nota atual" })).toBeVisible();

  const result = page.getByRole("region", { name: "Resultado" });
  await expect(result).toBeVisible({ timeout: RUN_TIMEOUT_MS });

  const accuracyText = await result.getByText(/% de precisão/).textContent();
  const accuracyPct = Number.parseInt(accuracyText ?? "", 10);
  expect(accuracyPct).toBeGreaterThan(MINIMUM_ACCURACY_PCT);

  await expect(result.getByText("XP ganho")).toBeVisible();
});
