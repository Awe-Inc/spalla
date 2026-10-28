import { describe, expect, it } from "vitest";

import { cappedPixelRatio, nextFit, pageFromTap, pageScaleFor } from "./fit";

const A4 = { width: 595, height: 842 };

describe("pageScaleFor", () => {
  it("shows the whole page in a wide box and fills the width in a tall one", () => {
    expect(pageScaleFor(A4, { width: 1200, height: 842 }, "pagina")).toBeCloseTo(1);
    expect(pageScaleFor(A4, { width: 595, height: 2000 }, "pagina")).toBeCloseTo(1);
  });

  it("ignores the height when fitting to width", () => {
    expect(pageScaleFor(A4, { width: 1190, height: 300 }, "largura")).toBeCloseTo(2);
  });

  it("falls back to no scaling on degenerate sizes", () => {
    expect(pageScaleFor({ width: 0, height: 0 }, { width: 800, height: 600 }, "pagina")).toBe(1);
    expect(pageScaleFor(A4, { width: 0, height: 600 }, "pagina")).toBe(1);
  });
});

describe("nextFit", () => {
  it("toggles between the two fits", () => {
    expect(nextFit("pagina")).toBe("largura");
    expect(nextFit("largura")).toBe("pagina");
  });
});

describe("pageFromTap", () => {
  it("turns back on the left third, forward on the right third, and stays in the middle", () => {
    expect(pageFromTap(0.1, 5, 10)).toBe(4);
    expect(pageFromTap(0.9, 5, 10)).toBe(6);
    expect(pageFromTap(0.5, 5, 10)).toBe(5);
    expect(pageFromTap(0.1, 1, 10)).toBe(1);
    expect(pageFromTap(0.9, 10, 10)).toBe(10);
  });
});

describe("cappedPixelRatio", () => {
  it("keeps the ratio for a normal page and lowers it when the bitmap would be too big", () => {
    expect(cappedPixelRatio(600, 800, 2)).toBe(2);
    expect(cappedPixelRatio(3000, 4000, 3)).toBeLessThan(1.2);
    expect(cappedPixelRatio(0, 0, 2)).toBe(2);
  });
});
