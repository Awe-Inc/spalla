import { expect, test } from "@playwright/test";

const SETTINGS_STORAGE_KEY = "fretless-settings";
const ONBOARDED_SETTINGS = JSON.stringify({ state: { onboardedAt: 1 }, version: 0 });
const LIBRARY_TITLE = "Adieux de l'hôtesse arabe";

test("uma peça da biblioteca entra na rotina e aparece na sessão de hoje", async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );

  await page.goto("/musicas");
  await page.getByRole("link", { name: `Trechos e andamento: ${LIBRARY_TITLE}` }).click();
  await page.waitForURL(/\/musicas\/peca\/biblioteca\//);
  const slug = new URL(page.url()).pathname.split("/").at(-1)!;

  const form = page.getByRole("form", { name: "Adicionar à rotina" });
  await expect(form.getByRole("combobox", { name: "Rotina" })).toHaveValue("-25");
  await form.getByRole("combobox", { name: "Bloco" }).selectOption({ label: "Revisão" });
  await form.getByRole("button", { name: "Adicionar à rotina" }).click();
  await expect(page.getByText("Já está em Minha rotina de 25 minutos.")).toBeVisible();
  await expect(form).toBeHidden();

  await page.getByRole("link", { name: "Ver a sessão de hoje" }).click();
  await expect(page.getByText("Minha rotina de 25 minutos", { exact: true })).toBeVisible();
  const pinned = page.getByRole("link", { name: LIBRARY_TITLE });
  await expect(pinned).toHaveAttribute("href", new RegExp(`/tocar/biblioteca/${slug}$`));
  await expect(page.getByText("Escolhida por você.")).toBeVisible();

  await page.goto("/praticar");
  await expect(page.getByRole("radio", { name: /Minha rotina de 25 minutos/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Editar" }).click();
  const blocks = page.getByRole("list", { name: "Blocos da rotina" });
  await expect(blocks.getByRole("listitem", { name: new RegExp(`Revisão: ${LIBRARY_TITLE}$`) })).toBeVisible();

  await page.getByRole("button", { name: `Soltar ${LIBRARY_TITLE}: o app volta a escolher` }).click();
  await expect(blocks.getByRole("listitem", { name: /Revisão$/ })).toBeVisible();
  await page.getByRole("button", { name: /^Salvar rotina/ }).click();
  await expect(blocks).toBeHidden();
  await page.goto("/");
  await expect(page.getByText(/^0 de \d+ blocos/)).toBeVisible();
  await expect(page.getByText("Escolhida por você.")).toBeHidden();
});
