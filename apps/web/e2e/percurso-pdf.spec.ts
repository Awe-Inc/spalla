import { expect, test, type Page } from "@playwright/test";

const SETTINGS_STORAGE_KEY = "fretless-settings";
const ONBOARDED_SETTINGS = JSON.stringify({ state: { onboardedAt: 1 }, version: 0 });
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const STAFF_LEFT = 50;
const STAFF_RIGHT = 562;
const LINE_GAP = 6;
const STAFF_HEIGHT = LINE_GAP * 4;
const STAFF_TOPS = [680, 480, 280];
const MEASURE_WIDTH = (STAFF_RIGHT - STAFF_LEFT) / 4;

type LastBar = "plain" | "repeat";

function rect(x: number, y: number, width: number, height: number): string {
  return `${x} ${y} ${width} ${height} re f\n`;
}

function system(top: number, lastBar: LastBar): string {
  let drawing = "";
  for (let line = 0; line < 5; line += 1) drawing += rect(STAFF_LEFT, top - line * LINE_GAP, STAFF_RIGHT - STAFF_LEFT, 0.7);
  const bottom = top - STAFF_HEIGHT;
  drawing += rect(STAFF_LEFT, bottom, 0.8, STAFF_HEIGHT + 0.7);
  for (let bar = 1; bar <= 4; bar += 1) {
    const x = STAFF_LEFT + bar * MEASURE_WIDTH;
    if (bar < 4 || lastBar === "plain") drawing += rect(x - 0.8, bottom, 0.8, STAFF_HEIGHT + 0.7);
    for (let beat = 0; beat < 3; beat += 1) {
      const noteX = x - MEASURE_WIDTH + 25 + beat * 32;
      drawing += rect(noteX, bottom + 10, 5, 4);
      drawing += rect(noteX + 4.4, bottom + 12, 0.6, 14);
    }
  }
  if (lastBar === "repeat") {
    drawing += rect(STAFF_RIGHT - 3, bottom, 3, STAFF_HEIGHT + 0.7);
    drawing += rect(STAFF_RIGHT - 6, bottom, 0.8, STAFF_HEIGHT + 0.7);
    drawing += rect(STAFF_RIGHT - 11.5, bottom + 7.5, 3, 3);
    drawing += rect(STAFF_RIGHT - 11.5, bottom + 13.5, 3, 3);
  }
  return drawing;
}

function word(text: string, x: number, y: number): string {
  return `BT /F1 11 Tf ${x} ${y} Td (${text}) Tj ET\n`;
}

function scorePdf(): Buffer {
  const pageOne = STAFF_TOPS.map((top, index) => system(top, index === 2 ? "repeat" : "plain")).join("");
  const pageTwo = STAFF_TOPS.map((top) => system(top, "plain")).join("") + word("Fine", 500, STAFF_TOPS[1]! - STAFF_HEIGHT - 16) + word("D.C. al Fine", 490, STAFF_TOPS[2]! - STAFF_HEIGHT - 16);
  const streams = [pageOne, pageTwo].map((stream) => `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  const resources = "<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents 5 0 R /Resources ${resources} >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents 6 0 R /Resources ${resources} >>`,
    ...streams,
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

test("o PDF com repetição, Fine e D.C. rola pelo percurso real e aceita correção", async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );

  await page.goto("/repertorio/estante");
  await page.locator('input[type="file"]').setInputFiles({ name: "Minueto.pdf", mimeType: "application/pdf", buffer: scorePdf() });
  await page.getByRole("link", { name: "Abrir Minueto" }).click();
  await page.getByRole("button", { name: "Rolagem automática" }).click();

  const controls = page.getByRole("region", { name: "Rolagem automática" });
  const percurso = page.getByTestId("percurso");
  await expect(percurso).toHaveText("24 compassos lidos, 56 tocados. Percurso: 1–12, 1–24, 1–20.", { timeout: 30_000 });
  await expect(controls.getByLabel("Compassos")).toHaveCount(0);

  await controls.getByLabel("Tempos por compasso").fill("2");
  await controls.getByLabel("Bpm", { exact: true }).fill("240");
  await expect(page.getByText("Duração 0:28")).toBeVisible();

  await controls.getByRole("button", { name: "Começar" }).click();
  await expect(page.getByText("Repetição: volta ao compasso 1")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("compasso-atual")).toBeVisible();
  await expect(page.getByTestId("compasso-destino")).toBeVisible();

  const beforeJump = await scrollTop(page);
  expect(beforeJump).toBeGreaterThan(0);
  await expect.poll(() => scrollTop(page), { timeout: 5_000 }).toBeLessThan(beforeJump / 2);

  await page.keyboard.press("Space");
  await expect(controls.getByRole("button", { name: "Começar" })).toBeVisible();

  await controls.getByRole("button", { name: "Corrigir marcações" }).click();
  await page.getByRole("button", { name: "Compasso 12", exact: true }).click();
  const editor = page.getByRole("group", { name: "Marcações do compasso 12" });
  const repeatEnd = editor.getByRole("button", { name: "Fim de repetição" });
  await expect(repeatEnd).toHaveAttribute("aria-pressed", "true");
  await repeatEnd.click();
  await expect(percurso).toHaveText("24 compassos lidos, 44 tocados. Percurso: 1–24, 1–20.");

  await page.reload();
  await page.getByRole("button", { name: "Rolagem automática" }).click();
  await expect(percurso).toHaveText("24 compassos lidos, 44 tocados. Percurso: 1–24, 1–20.", { timeout: 30_000 });
});
