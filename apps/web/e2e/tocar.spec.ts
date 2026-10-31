import { expect, test, type Page } from "@playwright/test";

const EXERCISE_ID = "scales.1oct.69";
const EXERCISE_TITLE = "Lá maior - uma oitava";
const SETTINGS_STORAGE_KEY = "fretless-settings";
const ONBOARDED_SETTINGS = JSON.stringify({ state: { onboardedAt: 1 }, version: 0 });
const RUN_TIMEOUT_MS = 90_000;
const MINIMUM_ACCURACY_PCT = 70;
const MINIMUM_LANE_COLOURS = 5;
const LIBRARY_TITLE = "Adieux de l'hôtesse arabe";
const LIBRARY_COMPOSER = "Georges Bizet";

async function expectGoodResult(page: Page): Promise<void> {
  const result = page.getByRole("region", { name: "Resultado" });
  await expect(result).toBeVisible({ timeout: RUN_TIMEOUT_MS });

  const accuracyText = await result.getByText(/% de precisão/).textContent();
  const accuracyPct = Number.parseInt(accuracyText ?? "", 10);
  expect(accuracyPct).toBeGreaterThan(MINIMUM_ACCURACY_PCT);

  await expect(result.getByText("XP ganho")).toBeVisible();
}

function distinctColourCount(element: Element): number {
  const canvas = element as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) return 0;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const colours = new Set<number>();
  for (let offset = 0; offset < data.length; offset += 4 * 97) {
    colours.add(((data[offset] ?? 0) << 16) | ((data[offset + 1] ?? 0) << 8) | (data[offset + 2] ?? 0));
  }
  return colours.size;
}

test("o jogador sintético toca um exercício do começo ao resultado", async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );

  await page.goto(`/tocar/${EXERCISE_ID}?jogador=sintetico`);

  await expect(page.getByRole("heading", { name: EXERCISE_TITLE })).toBeVisible();
  await expect(page.getByText("Jogador sintético")).toBeVisible();

  await page.getByRole("button", { name: "Estou de fone" }).click();
  await page.getByRole("group", { name: "Vista" }).getByRole("button", { name: "Pistas e pauta" }).click();
  await page.getByRole("button", { name: "Começar" }).click();

  const playing = page.getByRole("region", { name: "Nota atual" });
  await expect(playing).toBeVisible();
  const lanes = playing.getByRole("img", { name: /pistas das cordas/i });
  await expect(lanes).toBeVisible();
  await expect(playing.getByRole("img", { name: /partitura rolando/i })).toBeVisible();
  await expect.poll(() => lanes.evaluate(distinctColourCount)).toBeGreaterThan(MINIMUM_LANE_COLOURS);

  await expectGoodResult(page);
});

test("uma canção da biblioteca CC0 abre pelo catálogo e toca até o resultado", async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );

  await page.goto("/repertorio");
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: LIBRARY_TITLE, exact: true }) });
  await expect(row).toContainText(LIBRARY_COMPOSER);
  const href = await row.getByRole("link", { name: `Tocar ${LIBRARY_TITLE}` }).getAttribute("href");
  await page.goto(`${href}?jogador=sintetico`);

  await expect(page.getByRole("heading", { name: LIBRARY_TITLE })).toBeVisible();
  await page.getByRole("button", { name: "Começar" }).click();
  await expect(page.getByRole("region", { name: "Nota atual" })).toBeVisible();

  await expectGoodResult(page);
});
