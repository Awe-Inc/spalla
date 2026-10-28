import { describe, expect, it } from "vitest";

import type { ExerciseResult } from "./db";
import { daySeed, pickSeeded, rankBySpacing, spacedPriority } from "./spaced";

const DAY_MS = 86_400_000;
const now = Date.parse("2026-10-28T12:00:00");

function result(exerciseId: string, stars: 0 | 1 | 2 | 3, daysAgo: number): ExerciseResult {
  return { exerciseId, stars, playedAt: now - daysAgo * DAY_MS, accuracyPct: 80, meanSignedCents: 0, bpm: 60, durationSeconds: 60 };
}

describe("spacedPriority", () => {
  it("puts never-played items above fresh ones but below overdue ones", () => {
    const fresh = result("a", 3, 1);
    const overdue = result("b", 1, 9);
    expect(spacedPriority(undefined, undefined, now)).toBe(2);
    expect(spacedPriority(fresh, fresh, now)).toBeLessThan(2);
    expect(spacedPriority(overdue, overdue, now)).toBeGreaterThan(2);
  });

  it("weights missing stars", () => {
    const oneStar = result("a", 1, 3);
    const threeStars = result("b", 3, 21);
    expect(spacedPriority(oneStar, oneStar, now)).toBeCloseTo(3);
    expect(spacedPriority(threeStars, threeStars, now)).toBeCloseTo(1);
  });
});

describe("rankBySpacing", () => {
  it("orders by priority descending", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const a = result("a", 3, 0);
    const b = result("b", 0, 2);
    const best = new Map([["a", a], ["b", b]]);
    expect(rankBySpacing(items, best, best, now).map((entry) => entry.item.id)).toEqual(["b", "c", "a"]);
  });
});

describe("daySeed", () => {
  it("is stable for a day and differs between days", () => {
    expect(daySeed("2026-10-28")).toBe(daySeed("2026-10-28"));
    expect(daySeed("2026-10-28")).not.toBe(daySeed("2026-10-29"));
    expect(pickSeeded(["x", "y", "z"], daySeed("2026-10-28"))).toBeDefined();
    expect(pickSeeded([], 3)).toBeUndefined();
  });
});
