import { expect, test } from "@playwright/test";

const SETTINGS_STORAGE_KEY = "fretless-settings";
const ONBOARDED_SETTINGS = JSON.stringify({ state: { onboardedAt: 1 }, version: 0 });
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const STAFF_LEFT = 50;
const STAFF_RIGHT = 562;
const LINE_GAP = 8;
const STAFF_HEIGHT = LINE_GAP * 4;
const STAFF_TOPS = [680, 480];
const MEASURES_PER_SYSTEM = 4;
const MEASURE_WIDTH = (STAFF_RIGHT - STAFF_LEFT) / MEASURES_PER_SYSTEM;
const HEAD_RADIUS_X = LINE_GAP * 0.68;
const HEAD_RADIUS_Y = LINE_GAP * 0.5;
const CURVE = 0.5523;
const SHORT_MEASURE = 5;
const CLEF_STEPS = 11;

function rect(x: number, y: number, width: number, height: number): string {
  return `${x} ${y} ${width} ${height} re f\n`;
}

function head(x: number, y: number): string {
  const [rx, ry] = [HEAD_RADIUS_X, HEAD_RADIUS_Y];
  const [cx, cy] = [rx * CURVE, ry * CURVE];
  return [
    `${x + rx} ${y} m`,
    `${x + rx} ${y + cy} ${x + cx} ${y + ry} ${x} ${y + ry} c`,
    `${x - cx} ${y + ry} ${x - rx} ${y + cy} ${x - rx} ${y} c`,
    `${x - rx} ${y - cy} ${x - cx} ${y - ry} ${x} ${y - ry} c`,
    `${x + cx} ${y - ry} ${x + rx} ${y - cy} ${x + rx} ${y} c f\n`,
  ].join(" ");
}

function quarterNote(x: number, staffBottom: number): string {
  const y = staffBottom + LINE_GAP;
  return head(x, y) + rect(x + HEAD_RADIUS_X - 1, y, 1, LINE_GAP * 3.5);
}

function clef(staffBottom: number): string {
  let drawing = "";
  for (let step = 0; step < CLEF_STEPS; step += 1) drawing += rect(STAFF_LEFT + 6 + step * 1.5, staffBottom - 6 + step * 4, 4, 5);
  return drawing;
}

function system(top: number, firstMeasure: number): string {
  let drawing = "";
  for (let line = 0; line < 5; line += 1) drawing += rect(STAFF_LEFT, top - line * LINE_GAP, STAFF_RIGHT - STAFF_LEFT, 0.8);
  const bottom = top - STAFF_HEIGHT;
  drawing += rect(STAFF_LEFT, bottom, 1, STAFF_HEIGHT + 0.8);
  drawing += clef(bottom);
  for (let bar = 0; bar < MEASURES_PER_SYSTEM; bar += 1) {
    const barLeft = STAFF_LEFT + bar * MEASURE_WIDTH;
    drawing += rect(barLeft + MEASURE_WIDTH - 1, bottom, 1, STAFF_HEIGHT + 0.8);
    const beats = firstMeasure + bar === SHORT_MEASURE ? 3 : 4;
    for (let beat = 0; beat < beats; beat += 1) drawing += quarterNote(barLeft + 44 + beat * 19, bottom);
  }
  return drawing;
}

function imageOnlyPdf(): Buffer {
  const stream = STAFF_TOPS.map((top, index) => system(top, index * MEASURES_PER_SYSTEM)).join("");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
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

test("PDF sem texto passa pelo OCR, vira peça tocável e o compasso errado é corrigido antes de salvar", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );

  const pageWorkers: string[] = [];
  page.on("worker", (worker) => {
    if (worker.url().includes("pageWorker")) pageWorkers.push(worker.url());
  });

  await page.goto("/repertorio/estante");
  await page.locator('input[type="file"]').setInputFiles({ name: "Estudo lido.pdf", mimeType: "application/pdf", buffer: imageOnlyPdf() });
  await page.getByRole("link", { name: "Abrir Estudo lido" }).click();
  await page.getByRole("button", { name: "Rolagem automática" }).click();

  await expect(page.getByTestId("percurso")).toContainText("8 compassos lidos", { timeout: 120_000 });
  await expect(page.getByText("foram lidos por OCR")).toBeVisible();
  expect(pageWorkers.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Converter em partitura tocável" }).click();
  const summary = page.getByTestId("conversao-resumo");
  await expect(summary).toContainText("7 de 8 compassos fecham", { timeout: 60_000 });

  await page.getByRole("button", { name: "Compasso 6", exact: true }).click();
  const conversion = page.getByTestId("conversao");
  await conversion.getByLabel("Tempos").last().selectOption("2");
  await expect(summary).toContainText("8 de 8 compassos fecham");

  await conversion.getByRole("button", { name: "Salvar no repertório" }).click();
  await page.getByRole("link", { name: "Abrir a peça" }).click();
  await expect(page).toHaveURL(/\/repertorio\/peca\/musica\/\d+/);
  await expect(page.getByRole("heading", { name: "Estudo lido" })).toBeVisible();
});

test("worker de leitura que não carrega não impede a leitura: segue na thread principal", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SETTINGS_STORAGE_KEY, ONBOARDED_SETTINGS] as const,
  );
  await page.route(/pageWorker/, (route) => route.abort());

  await page.goto("/repertorio/estante");
  await page.locator('input[type="file"]').setInputFiles({ name: "Estudo lido.pdf", mimeType: "application/pdf", buffer: imageOnlyPdf() });
  await page.getByRole("link", { name: "Abrir Estudo lido" }).click();
  await page.getByRole("button", { name: "Rolagem automática" }).click();

  await expect(page.getByTestId("percurso")).toContainText("8 compassos lidos", { timeout: 120_000 });
});
