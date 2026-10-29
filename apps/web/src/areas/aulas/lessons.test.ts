import { describe, expect, it } from "vitest";

import { isOverdue, pdfFileName, pendingCount, safeExternalUrl, safePlayPath } from "./lessons";

describe("safePlayPath", () => {
  it("accepts the paths the app builds for exercises and library pieces", () => {
    expect(safePlayPath("/tocar/scales.2oct.69")).toBe("/tocar/scales.2oct.69");
    expect(safePlayPath("/tocar/biblioteca/minueto-em-sol")).toBe("/tocar/biblioteca/minueto-em-sol");
  });

  it("refuses anything that could leave the play screen", () => {
    expect(safePlayPath("//evil.example/tocar/x")).toBeNull();
    expect(safePlayPath("/voce/conta")).toBeNull();
    expect(safePlayPath("/tocar/../admin")).toBeNull();
    expect(safePlayPath("javascript:alert(1)")).toBeNull();
    expect(safePlayPath(undefined)).toBeNull();
  });
});

describe("safeExternalUrl", () => {
  it("keeps web links and drops other schemes", () => {
    expect(safeExternalUrl("https://youtube.com/watch?v=1")).toBe("https://youtube.com/watch?v=1");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,x")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe("assignment state", () => {
  it("is overdue only when pending and past the due day", () => {
    expect(isOverdue({ dueOn: "2026-10-28", doneAt: null }, "2026-10-29")).toBe(true);
    expect(isOverdue({ dueOn: "2026-10-29", doneAt: null }, "2026-10-29")).toBe(false);
    expect(isOverdue({ dueOn: "2026-10-28", doneAt: "2026-10-29T10:00:00Z" }, "2026-10-29")).toBe(false);
    expect(isOverdue({ dueOn: null, doneAt: null }, "2026-10-29")).toBe(false);
  });

  it("counts pending assignments", () => {
    expect(pendingCount([{ doneAt: null }, { doneAt: "x" }, { doneAt: null }])).toBe(2);
  });
});

describe("pdfFileName", () => {
  it("turns a material title into a safe file name", () => {
    expect(pdfFileName("Escalas: Sol / Ré")).toBe("Escalas Sol Ré.pdf");
    expect(pdfFileName("apostila.PDF")).toBe("apostila.PDF");
    expect(pdfFileName("  ")).toBe("material.pdf");
  });
});
