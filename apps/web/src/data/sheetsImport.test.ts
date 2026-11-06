import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "./db";
import { importSheetFile, rememberSheetScrollPlan } from "./sheets";

const PLAN = { measures: 120, beatsPerMeasure: 3, bpm: 84 };

function pdfFile(name: string): File {
  const bytes = new TextEncoder().encode("%PDF-1.7\n");
  return Object.assign(new File([bytes], name, { type: "application/pdf" }), { arrayBuffer: async () => bytes.buffer });
}

describe("importSheetFile", () => {
  beforeEach(async () => {
    await db.sheets.clear();
    await db.sheetFiles.clear();
  });

  it("keeps the scroll plan when the same file is imported again", async () => {
    const first = await importSheetFile(pdfFile("sitt.pdf"), async () => 4);
    if (!first.ok) throw new Error(first.error);
    await rememberSheetScrollPlan(first.sheet.id as number, PLAN);

    const second = await importSheetFile(pdfFile("sitt.pdf"), async () => 6);
    if (!second.ok) throw new Error(second.error);

    expect(second.sheet.scrollPlan).toEqual(PLAN);
    expect((await db.sheets.get(first.sheet.id as number))?.scrollPlan).toEqual(PLAN);
  });

  it("starts a new file without a plan", async () => {
    const imported = await importSheetFile(pdfFile("novo.pdf"), async () => 1);
    if (!imported.ok) throw new Error(imported.error);
    expect(imported.sheet.scrollPlan).toBeUndefined();
  });
});
