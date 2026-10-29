import { describe, expect, it } from "vitest";

import { detailPath, phraseSections, practicePath, readPracticeRequest, sectionLabel, sortedSections } from "./sections";

describe("phraseSections", () => {
  it("splits a piece into four-bar phrases", () => {
    expect(phraseSections(8)).toEqual([
      { firstIndex: 0, lastIndex: 3 },
      { firstIndex: 4, lastIndex: 7 },
    ]);
  });

  it("folds a lone last bar into the phrase before it", () => {
    expect(phraseSections(9)).toEqual([
      { firstIndex: 0, lastIndex: 3 },
      { firstIndex: 4, lastIndex: 8 },
    ]);
  });

  it("keeps a two-bar tail as its own phrase", () => {
    expect(phraseSections(10).at(-1)).toEqual({ firstIndex: 8, lastIndex: 9 });
  });
});

describe("section links", () => {
  it("names a range with the bar numbers a player reads on the page", () => {
    expect(sectionLabel({ firstIndex: 8, lastIndex: 15 })).toBe("Compassos 9–16");
    expect(sectionLabel({ firstIndex: 4, lastIndex: 4 })).toBe("Compasso 5");
  });

  it("maps every play route to its detail route", () => {
    expect(detailPath("/tocar/repertoire.1")).toBe("/repertorio/peca/repertoire.1");
    expect(detailPath("/tocar/musica/7")).toBe("/repertorio/peca/musica/7");
    expect(detailPath("/tocar/biblioteca/bizet-adieux")).toBe("/repertorio/peca/biblioteca/bizet-adieux");
  });

  it("round-trips a practice request through the URL", () => {
    const path = practicePath("/tocar/musica/7", 72, { firstIndex: 8, lastIndex: 15 });
    expect(path).toBe("/tocar/musica/7?de=9&ate=16&bpm=72");
    const params = new URL(path, "http://localhost").searchParams;
    expect(readPracticeRequest(params, 20)).toEqual({ range: { firstIndex: 8, lastIndex: 15 }, bpm: 72 });
  });

  it("ignores a range the score does not have", () => {
    const params = new URLSearchParams("de=9&ate=40&bpm=abc");
    expect(readPracticeRequest(params, 20)).toEqual({ range: null, bpm: null });
    expect(readPracticeRequest(new URLSearchParams("de=5&ate=2"), 20).range).toBeNull();
  });

  it("orders saved sections by where they start", () => {
    const sections = [
      { id: 1, pieceKey: "p", firstIndex: 8, lastIndex: 11, bpm: 60, createdAt: 1 },
      { id: 2, pieceKey: "p", firstIndex: 0, lastIndex: 3, bpm: 60, createdAt: 2 },
    ];
    expect(sortedSections(sections).map((section) => section.id)).toEqual([2, 1]);
  });
});
