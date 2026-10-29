import { expect, test } from "@playwright/test";

const SETTINGS_STORAGE_KEY = "fretless-settings";
const ONBOARDED_SETTINGS = JSON.stringify({ state: { onboardedAt: 1 }, version: 0 });
const LIBRARY_TITLE = "Adieux de l'hôtesse arabe";
const SECTION_LABEL = "Compassos 2–3";

test("um trecho marcado no detalhe da peça fica guardado e abre o Tocar em loop no andamento escolhido", async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );

  await page.goto("/musicas");
  await page.getByRole("link", { name: `Trechos e andamento: ${LIBRARY_TITLE}` }).click();
  await expect(page.getByRole("heading", { name: LIBRARY_TITLE })).toBeVisible();

  await page.getByRole("button", { name: "Diminuir 5 bpm" }).click();
  const form = page.getByRole("form", { name: "Marcar trecho" });
  await form.getByLabel("Do compasso").selectOption({ label: "2" });
  await form.getByLabel("ao").selectOption({ label: "3" });
  await form.getByRole("button", { name: "Guardar trecho" }).click();
  await expect(page.getByRole("button", { name: `Apagar trecho: ${SECTION_LABEL}` })).toBeVisible();

  await page.reload();
  const practice = page.getByRole("link", { name: `Praticar em loop: ${SECTION_LABEL}` }).first();
  await expect(practice).toBeVisible();
  const href = await practice.getAttribute("href");
  expect(href).toContain("de=2&ate=3&bpm=");

  await page.goto(`${href}&jogador=sintetico`);
  await expect(page.getByRole("heading", { name: LIBRARY_TITLE })).toBeVisible();
  await expect(page.getByRole("button", { name: "Repetir trecho" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^Escrito: \d+ bpm$/)).toBeVisible();
});
