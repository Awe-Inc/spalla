import { describe, expect, it } from "vitest";

import { clampPage, describeSizeError, describeSheetStorageError, hasPdfHeader, isPdfFile, MAX_SHEET_FILE_BYTES, sheetTitle } from "./sheets";

describe("isPdfFile", () => {
  it("accepts by mime type or by extension, whatever the case", () => {
    expect(isPdfFile({ name: "Sitt.PDF", type: "" })).toBe(true);
    expect(isPdfFile({ name: "sem-extensao", type: "application/pdf" })).toBe(true);
    expect(isPdfFile({ name: "partitura.mxl", type: "application/octet-stream" })).toBe(false);
  });
});

describe("hasPdfHeader", () => {
  it("recognises the %PDF magic and rejects anything else", () => {
    expect(hasPdfHeader(new TextEncoder().encode("%PDF-1.7\n"))).toBe(true);
    expect(hasPdfHeader(new TextEncoder().encode("PK\u0003\u0004"))).toBe(false);
    expect(hasPdfHeader(new Uint8Array(0))).toBe(false);
  });
});

describe("sheetTitle", () => {
  it("drops the extension and underscores but keeps the author's own dashes", () => {
    expect(sheetTitle("Hans Sitt - Livro 1.pdf")).toBe("Hans Sitt - Livro 1");
    expect(sheetTitle("Wohlfahrt_60_estudos.PDF")).toBe("Wohlfahrt 60 estudos");
    expect(sheetTitle(".pdf")).toBe(".pdf");
  });
});

describe("clampPage", () => {
  it("keeps the page inside 1..pageCount and survives junk", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(Number.NaN, 10)).toBe(1);
    expect(clampPage(3.6, 10)).toBe(4);
    expect(clampPage(5, 0)).toBe(1);
  });
});

describe("limits", () => {
  it("allows the scanned method books, which are often above 8 MB", () => {
    expect(MAX_SHEET_FILE_BYTES).toBeGreaterThanOrEqual(32 * 1024 * 1024);
    expect(describeSizeError(70 * 1024 * 1024)).toContain("70 MB");
  });
});

describe("hasPdfHeader with junk before the magic", () => {
  it("accepts a header anywhere in the first kilobyte", () => {
    const junk = new Uint8Array(100).fill(32);
    const bytes = new Uint8Array([...junk, ...new TextEncoder().encode("%PDF-1.4")]);
    expect(hasPdfHeader(bytes)).toBe(true);
  });
});

describe("describeSheetStorageError", () => {
  it("tells the user the device is full on a quota error", () => {
    const quota = new Error("full");
    quota.name = "QuotaExceededError";
    expect(describeSheetStorageError(quota)).toContain("sem espaço");
    expect(describeSheetStorageError(new Error("x"))).toContain("Tente de novo");
  });
});
