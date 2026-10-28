import type { CurriculumModule, Exercise } from "@fretless/core";
import { describe, expect, it } from "vitest";

import type { ExerciseResult } from "./db";
import { catalogFromCurriculum, catalogFromStored, EMPTY_FILTERS, filterPieces, levelFromNoteCount, pieceStatus, statusByPiece } from "./pieces";

function exercise(overrides: Partial<Exercise>): Exercise {
  return {
    id: "repertoire.0",
    moduleId: "repertoire",
    title: "Ode à Alegria",
    subtitle: "Beethoven",
    focus: "",
    howTo: "",
    source: "",
    level: 2,
    defaultBpm: 80,
    minBpm: 50,
    maxBpm: 100,
    kind: "piece",
    playable: true,
    droneMidi: 62,
    metronome: true,
    freshEveryTime: false,
    recipe: {} as Exercise["recipe"],
    ...overrides,
  };
}

function result(overrides: Partial<ExerciseResult>): ExerciseResult {
  return { exerciseId: "repertoire.0", playedAt: 1, bpm: 80, accuracyPct: 70, meanSignedCents: 0, stars: 1, durationSeconds: 30, ...overrides };
}

const curriculum: CurriculumModule[] = [
  {
    id: "repertoire",
    title: "Repertório",
    tagline: "",
    description: "",
    accent: 0,
    levelFrom: 1,
    levelTo: 3,
    exercises: [exercise({}), exercise({ id: "repertoire.scale", kind: "scale" }), exercise({ id: "suzuki.twinkle.0", title: "Twinkle", subtitle: "A melodia", level: 1 })],
  },
];

describe("catalog", () => {
  it("keeps only playable pieces and derives composer and genre", () => {
    const catalog = catalogFromCurriculum(curriculum);
    expect(catalog.map((piece) => piece.key)).toEqual(["repertoire.0", "suzuki.twinkle.0"]);
    expect(catalog[0]).toMatchObject({ composer: "Beethoven", genre: "Repertório", playTo: "/tocar/repertoire.0" });
    expect(catalog[1]).toMatchObject({ composer: "Tradicional", level: 1 });
  });

  it("maps stored pieces to the musica route and keeps the file name as result id", () => {
    const [piece] = catalogFromStored([{ id: 7, fileName: "minueto.mxl", title: "", composer: "", genre: "", level: 2, bytes: new Uint8Array(), noteCount: 10, beatsPerMinute: 90, importedAt: 0 }]);
    expect(piece).toMatchObject({ key: "musica:7", resultId: "musica:minueto.mxl", title: "minueto.mxl", genre: "Importada", playTo: "/tocar/musica/7", storedId: 7 });
  });
});

describe("pieceStatus", () => {
  it("is não iniciada without results, em estudo with weak ones, dominada at mastery 3 or three stars", () => {
    expect(pieceStatus([])).toBe("nao-iniciada");
    expect(pieceStatus([result({ masteryLevel: 1 })])).toBe("em-estudo");
    expect(pieceStatus([result({ masteryLevel: 3 })])).toBe("dominada");
    expect(pieceStatus([result({ stars: 3 })])).toBe("dominada");
  });

  it("filters by level, composer, genre and status together", () => {
    const catalog = catalogFromCurriculum(curriculum);
    const statuses = statusByPiece(catalog, [result({ masteryLevel: 3 })]);
    expect(filterPieces(catalog, statuses, { ...EMPTY_FILTERS, status: "dominada" }).map((piece) => piece.key)).toEqual(["repertoire.0"]);
    expect(filterPieces(catalog, statuses, { ...EMPTY_FILTERS, status: "nao-iniciada", level: 1 }).map((piece) => piece.key)).toEqual(["suzuki.twinkle.0"]);
    expect(filterPieces(catalog, statuses, { ...EMPTY_FILTERS, composer: "Beethoven", genre: "Outro" })).toEqual([]);
  });
});

describe("levelFromNoteCount", () => {
  it("grows with notes and tempo", () => {
    expect(levelFromNoteCount(30, 70)).toBe(1);
    expect(levelFromNoteCount(60, 90)).toBe(2);
    expect(levelFromNoteCount(120, 120)).toBe(3);
    expect(levelFromNoteCount(300, 120)).toBe(4);
  });
});
