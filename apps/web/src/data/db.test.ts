import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { bestResultsByExercise, currentStreak, db, localDayKey, recordSectionRun, starsFor, type ExerciseResult } from "./db";

function result(exerciseId: string, stars: 0 | 1 | 2 | 3, accuracyPct: number): ExerciseResult {
  return { exerciseId, stars, accuracyPct, playedAt: 0, meanSignedCents: 0, bpm: 60, durationSeconds: 30 };
}

describe("schema", () => {
  it("indexes every key the pages order or filter by", () => {
    expect(Object.keys(db.pieces.schema.idxByName)).toEqual(expect.arrayContaining(["fileName", "importedAt"]));
    expect(Object.keys(db.results.schema.idxByName)).toEqual(expect.arrayContaining(["exerciseId", "playedAt"]));
    expect(Object.keys(db.sheets.schema.idxByName)).toEqual(expect.arrayContaining(["fileName", "openedAt"]));
  });

  it("no longer carries the unused settings table", () => {
    expect(db.tables.map((table) => table.name)).not.toContain("settings");
  });
});

describe("starsFor", () => {
  it("gives three stars only at written tempo with 95% or more", () => {
    expect(starsFor(96, 60, 60)).toBe(3);
    expect(starsFor(96, 50, 60)).toBe(2);
    expect(starsFor(85, 60, 60)).toBe(2);
    expect(starsFor(40, 60, 60)).toBe(1);
    expect(starsFor(0, 60, 60)).toBe(0);
  });
});

describe("bestResultsByExercise", () => {
  it("keeps the result with more stars, then more accuracy", () => {
    const best = bestResultsByExercise([result("a", 1, 50), result("a", 2, 81), result("a", 2, 90), result("b", 3, 99)]);
    expect(best.get("a")?.accuracyPct).toBe(90);
    expect(best.get("b")?.stars).toBe(3);
  });
});

describe("currentStreak", () => {
  it("counts consecutive practiced days ending today", () => {
    const days = [
      { day: "2026-10-28", minutes: 10, exercisesPlayed: 2 },
      { day: "2026-10-27", minutes: 5, exercisesPlayed: 1 },
      { day: "2026-10-25", minutes: 5, exercisesPlayed: 1 },
    ];
    expect(currentStreak(days, "2026-10-28")).toBe(2);
  });

  it("keeps yesterday's streak alive while today is still open", () => {
    expect(currentStreak([{ day: "2026-10-27", minutes: 5, exercisesPlayed: 1 }], "2026-10-28")).toBe(1);
  });

  it("is zero when yesterday was missed too", () => {
    expect(currentStreak([{ day: "2026-10-26", minutes: 5, exercisesPlayed: 1 }], "2026-10-28")).toBe(0);
  });

  it("bridges a frozen day without counting it", () => {
    const days = [
      { day: "2026-10-28", minutes: 10, exercisesPlayed: 2 },
      { day: "2026-10-26", minutes: 5, exercisesPlayed: 1 },
    ];
    expect(currentStreak(days, "2026-10-28", ["2026-10-27"])).toBe(2);
    expect(currentStreak(days, "2026-10-28")).toBe(1);
  });

  it("ignores days with zero minutes", () => {
    expect(currentStreak([{ day: "2026-10-28", minutes: 0, exercisesPlayed: 0 }], "2026-10-28")).toBe(0);
  });
});

describe("localDayKey", () => {
  it("formats using the local calendar date", () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("recordSectionRun", () => {
  beforeEach(async () => {
    await Promise.all([db.sectionRuns.clear(), db.practiceDays.clear(), db.results.clear()]);
  });

  it("keeps the bar range and counts minutes without creating a result", async () => {
    const playedAt = new Date(2026, 9, 31, 10).getTime();
    await db.practiceDays.put({ day: "2026-10-31", minutes: 2, exercisesPlayed: 1, xp: 30 });
    await recordSectionRun({ pieceKey: "scales.1oct.69", firstIndex: 2, lastIndex: 5, accuracyPct: 82, bpm: 72, durationSeconds: 90, playedAt });

    const [run] = await db.sectionRuns.toArray();
    expect(run).toMatchObject({ firstIndex: 2, lastIndex: 5, accuracyPct: 82 });
    expect(await db.practiceDays.get("2026-10-31")).toMatchObject({ minutes: 3.5, exercisesPlayed: 1, xp: 30 });
    expect(await db.results.count()).toBe(0);
  });
});
