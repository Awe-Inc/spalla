import { describe, expect, it } from "vitest";

import { bestResultsByExercise, currentStreak, localDayKey, starsFor, type ExerciseResult } from "./db";

function result(exerciseId: string, stars: 0 | 1 | 2 | 3, accuracyPct: number): ExerciseResult {
  return { exerciseId, stars, accuracyPct, playedAt: 0, meanSignedCents: 0, bpm: 60, durationSeconds: 30 };
}

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

  it("is zero when today has no practice", () => {
    expect(currentStreak([{ day: "2026-10-27", minutes: 5, exercisesPlayed: 1 }], "2026-10-28")).toBe(0);
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
