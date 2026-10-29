import { expect, test, type Page } from "@playwright/test";

const SETTINGS_STORAGE_KEY = "fretless-settings";
const ONBOARDED_SETTINGS = JSON.stringify({ state: { onboardedAt: 1 }, version: 0 });
const LIBRARY_TITLE = "Adieux de l'hôtesse arabe";

test.use({
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

async function recordTake(page: Page) {
  await page.getByRole("button", { name: "Gravar", exact: true }).click();
  await expect(page.getByRole("timer", { name: "Tempo de gravação" })).toHaveText(/^0:0[1-9]$/);
  await page.getByRole("button", { name: "Parar", exact: true }).click();
  const form = page.getByRole("form", { name: "Guardar gravação" });
  await expect(form.getByRole("textbox", { name: "Nome" })).toHaveValue(new RegExp(`^${LIBRARY_TITLE} - `));
  await form.getByRole("button", { name: "Guardar gravação" }).click();
  await expect(form).toBeHidden();
}

test("duas gravações da mesma peça ficam guardadas, aparecem no detalhe e se comparam lado a lado", async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );

  await page.goto("/repertorio");
  await page.getByRole("link", { name: `Trechos e andamento: ${LIBRARY_TITLE}` }).click();
  await page.waitForURL(/\/musicas\/peca\/biblioteca\//);
  const detailUrl = page.url();
  await page.getByRole("link", { name: "Gravar esta peça" }).click();
  await expect(page.getByRole("heading", { name: "Gravador" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ligar à peça" })).toHaveValue(/biblioteca:/);

  await recordTake(page);
  await recordTake(page);

  await page.reload();
  const compareButtons = page.getByRole("button", { name: /^Comparar: / });
  await expect(compareButtons).toHaveCount(2);
  await compareButtons.first().click();
  await expect(page.getByText("Escolha mais uma gravação da mesma peça para comparar.")).toBeVisible();
  await compareButtons.last().click();
  const comparison = page.getByRole("group", { name: "Comparação" });
  await expect(comparison.getByRole("heading", { name: "Antes" })).toBeVisible();
  await expect(comparison.getByRole("heading", { name: "Depois" })).toBeVisible();

  await page.goto(detailUrl);
  await expect(page.getByRole("link", { name: "Gravar e comparar" })).toBeVisible();
  await expect(page.locator("section", { has: page.getByRole("heading", { name: "Gravações" }) }).getByRole("listitem")).toHaveCount(2);
});
