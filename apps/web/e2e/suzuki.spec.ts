import { expect, test, type Page } from "@playwright/test";

const SETTINGS_STORAGE_KEY = "fretless-settings";
const ONBOARDED_SETTINGS = JSON.stringify({ state: { onboardedAt: 1 }, version: 0 });
const PIECE = "Lightly Row";

async function openBookOne(page: Page) {
  const book = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Livro 1", exact: true }) });
  await book.getByText("Peças e preparação").click();
  return book;
}

test("uma peça marcada como aprendida na aula entra em revisão e continua lá depois de recarregar", async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );

  await page.goto("/repertorio/suzuki");
  let book = await openBookOne(page);
  await expect(book.getByRole("link", { name: `Tocar ${PIECE}` })).toBeVisible();
  await book.getByRole("button", { name: `Aprendi na aula: ${PIECE}` }).click();
  await expect(book.getByRole("button", { name: `Desfazer: ${PIECE}` })).toBeVisible();
  await expect(book).toContainText("1 de");

  await page.reload();
  book = await openBookOne(page);
  await expect(book.getByRole("button", { name: `Desfazer: ${PIECE}` })).toBeVisible();
  await expect(book.getByRole("listitem").filter({ hasText: PIECE })).toContainText("Em revisão");
});
