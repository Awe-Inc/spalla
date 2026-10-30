import { expect, type Browser, type Page } from "@playwright/test";

const SETTINGS_STORAGE_KEY = "fretless-settings";
const ONBOARDED_SETTINGS = JSON.stringify({ state: { onboardedAt: 1 }, version: 0 });

export interface Conta {
  email: string;
  name: string;
  password: string;
  birthYear?: string;
}

export async function novaPagina(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );
  return context.newPage();
}

export async function criarConta(page: Page, conta: Conta, tipo: "Sou aluno" | "Sou professor", extra: { classCode?: string; bio?: string } = {}): Promise<void> {
  await page.goto("/criar-conta");
  await page.getByRole("radio", { name: tipo }).check();
  await page.getByLabel("Nome", { exact: true }).fill(conta.name);
  await page.getByLabel("E-mail", { exact: true }).fill(conta.email);
  await page.getByLabel("Senha", { exact: true }).fill(conta.password);
  if (conta.birthYear) await page.getByLabel(/^Ano de nascimento/).fill(conta.birthYear);
  if (extra.classCode) await page.getByLabel("Código da turma (opcional)").fill(extra.classCode);
  if (extra.bio) await page.getByLabel("Conte sobre suas aulas").fill(extra.bio);
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/\/criar-conta/);
}

export async function entrar(page: Page, conta: Conta): Promise<void> {
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(conta.email);
  await page.getByLabel("Senha", { exact: true }).fill(conta.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
}
