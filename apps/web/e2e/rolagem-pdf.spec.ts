import { expect, test, type Page } from "@playwright/test";

const SETTINGS_STORAGE_KEY = "fretless-settings";
const ONBOARDED_SETTINGS = JSON.stringify({ state: { onboardedAt: 1 }, version: 0 });
const PAGE_COUNT = 3;

function threePagePdf(): Buffer {
  const kids = Array.from({ length: PAGE_COUNT }, (_, index) => `${3 + index} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${PAGE_COUNT} >>`,
    ...Array.from({ length: PAGE_COUNT }, () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>"),
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefAt = body.length;
  const entries = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function scrollTop(page: Page): Promise<number> {
  return page.getByTestId("partitura-rolante").evaluate((element) => element.scrollTop);
}

test("a partitura em PDF rola sozinha depois da contagem, pausa e guarda o que o músico informou", async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );

  await page.goto("/repertorio/estante");
  await page.locator('input[type="file"]').setInputFiles({ name: "Valsa.pdf", mimeType: "application/pdf", buffer: threePagePdf() });
  await page.getByRole("link", { name: "Abrir Valsa" }).click();
  await expect(page.getByText(`página 1 de ${PAGE_COUNT}`)).toBeVisible();

  await page.getByRole("button", { name: "Rolagem automática" }).click();
  const controls = page.getByRole("region", { name: "Rolagem automática" });
  const start = controls.getByRole("button", { name: "Começar" });
  await expect(start).toBeDisabled();

  await controls.getByLabel("Compassos").fill("20");
  await controls.getByLabel("Bpm", { exact: true }).fill("120");
  await expect(page.getByText("Duração 0:40")).toBeVisible();
  await start.click();

  await expect(page.getByText(/Começa em \d/)).toBeVisible();
  expect(await scrollTop(page)).toBe(0);

  await expect.poll(() => scrollTop(page), { timeout: 15_000 }).toBeGreaterThan(50);
  const before = await scrollTop(page);
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(before);

  await page.keyboard.press("Space");
  await expect(start).toBeVisible();
  const paused = await scrollTop(page);
  await page.waitForTimeout(500);
  expect(await scrollTop(page)).toBe(paused);

  await page.reload();
  await page.getByRole("button", { name: "Rolagem automática" }).click();
  await expect(controls.getByLabel("Compassos")).toHaveValue("20");
  await expect(controls.getByLabel("Bpm", { exact: true })).toHaveValue("120");
});
