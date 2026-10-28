import { describe, expect, it } from "vitest";
import type { GameStats, NoteJudgement } from "@fretless/core";

import { achievementsEarned, levelForXp, longestPerfectStreak, masteryOfRun, xpForRun } from "./gamification";

function judgements(grades: NoteJudgement["grade"][]): NoteJudgement[] {
  return grades.map((grade, eventIndex) => ({ eventIndex, grade }) as unknown as NoteJudgement);
}

describe("xpForRun", () => {
  it("pays 3 for a perfect note, 1 for a great one and nothing otherwise", () => {
    expect(xpForRun(judgements(["Perfect", "Great", "Good", "Miss"]))).toBe(4);
  });

  it("doubles perfect notes after twenty in a row", () => {
    const twentyOne = judgements(Array.from({ length: 21 }, () => "Perfect" as const));
    expect(xpForRun(twentyOne)).toBe(20 * 3 + 6);
  });

  it("resets the multiplier on a miss", () => {
    const run = judgements([...Array.from({ length: 21 }, () => "Perfect" as const), "Miss", "Perfect"]);
    expect(xpForRun(run)).toBe(20 * 3 + 6 + 3);
  });
});

describe("masteryOfRun", () => {
  it("climbs the five levels", () => {
    expect(masteryOfRun({ accuracyPct: 50, bpm: 60 }, 80)).toBe(0);
    expect(masteryOfRun({ accuracyPct: 65, bpm: 60 }, 80)).toBe(1);
    expect(masteryOfRun({ accuracyPct: 85, bpm: 60 }, 80)).toBe(2);
    expect(masteryOfRun({ accuracyPct: 92, bpm: 80 }, 80)).toBe(3);
    expect(masteryOfRun({ accuracyPct: 92, bpm: 60, withDrone: true }, 80)).toBe(4);
    expect(masteryOfRun({ accuracyPct: 92, bpm: 80, fromMemory: true }, 80)).toBe(5);
  });
});

describe("achievementsEarned", () => {
  const stats = {} as GameStats;

  it("awards only what is new", () => {
    const earned = achievementsEarned(
      { stats, judgements: judgements(Array.from({ length: 30 }, () => "Perfect" as const)), playedAt: new Date("2026-10-28T23:00:00"), streak: 7, loopsCompleted: 0 },
      new Set(["coruja-musical"]),
    );
    expect(earned).toEqual(["afinador-humano", "o-metodico"]);
  });

  it("measures the longest perfect streak, not the total", () => {
    expect(longestPerfectStreak(judgements(["Perfect", "Perfect", "Miss", "Perfect"]))).toBe(2);
  });
});

describe("levelForXp", () => {
  it("grows the requirement a quarter per level", () => {
    expect(levelForXp(0)).toEqual({ level: 1, intoLevel: 0, needed: 100 });
    expect(levelForXp(100)).toEqual({ level: 2, intoLevel: 0, needed: 125 });
    expect(levelForXp(260)).toEqual({ level: 3, intoLevel: 35, needed: 156 });
  });
});
