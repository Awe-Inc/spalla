import { describe, expect, it } from "vitest";

import { accuracyTrend, heatLevel, heatmapWeeks } from "./calendar";

const today = new Date(2026, 9, 28, 12);

describe("heatmapWeeks", () => {
  it("ends on the week of today and marks the days after today as future", () => {
    const weeks = heatmapWeeks([], today, 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[1]!.map((cell) => cell.day)).toContain("2026-10-28");
    expect(weeks[1]!.find((cell) => cell.day === "2026-10-29")?.isFuture).toBe(true);
    expect(weeks[1]!.find((cell) => cell.day === "2026-10-28")?.isFuture).toBe(false);
  });

  it("fills the cells with the recorded minutes and goal", () => {
    const weeks = heatmapWeeks([{ day: "2026-10-27", minutes: 12, exercisesPlayed: 3, xp: 70, goalMet: true }], today, 1);
    const cell = weeks[0]!.find((entry) => entry.day === "2026-10-27")!;
    expect(cell.minutes).toBe(12);
    expect(heatLevel(cell)).toBe(3);
    expect(heatLevel({ ...cell, goalMet: false })).toBe(2);
    expect(heatLevel({ ...cell, goalMet: false, minutes: 4 })).toBe(1);
    expect(heatLevel({ ...cell, minutes: 0 })).toBe(0);
  });
});

describe("accuracyTrend", () => {
  it("needs two points and compares oldest with newest", () => {
    expect(accuracyTrend([{ playedAt: 1, accuracyPct: 50, bpm: 60 }])).toBeNull();
    const trend = accuracyTrend([
      { playedAt: 3, accuracyPct: 91, bpm: 70 },
      { playedAt: 1, accuracyPct: 62, bpm: 60 },
    ]);
    expect(trend).toEqual({ first: 62, last: 91, delta: 29 });
  });
});
