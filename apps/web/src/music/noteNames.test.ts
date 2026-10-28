import { describe, expect, it } from "vitest";

import { displayNoteName, formatCents, toLatinName } from "./noteNames";

describe("toLatinName", () => {
  it("translates the letter and keeps accidental and octave", () => {
    expect(toLatinName("A4")).toBe("Lá4");
    expect(toLatinName("G#5")).toBe("Sol#5");
    expect(toLatinName("Bb3")).toBe("Sib3");
  });

  it("returns unknown names untouched", () => {
    expect(toLatinName("?")).toBe("?");
  });
});

describe("displayNoteName", () => {
  it("respects the naming preference", () => {
    expect(displayNoteName("D4", "letters")).toBe("D4");
    expect(displayNoteName("D4", "latin")).toBe("Ré4");
  });
});

describe("formatCents", () => {
  it("says the direction in words", () => {
    expect(formatCents(0.4)).toBe("afinado");
    expect(formatCents(18)).toBe("18 cents alto");
    expect(formatCents(-7.6)).toBe("8 cents baixo");
  });
});
