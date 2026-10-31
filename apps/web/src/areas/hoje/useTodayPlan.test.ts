import { describe, expect, it } from "vitest";

import type { ExerciseResult } from "@/data/db";

import { triedDaysByExercise } from "./useTodayPlan";

function result(exerciseId: string, playedAt: string): ExerciseResult {
  return { exerciseId, playedAt: new Date(playedAt).getTime() } as ExerciseResult;
}

describe("triedDaysByExercise", () => {
  it("counts distinct days per exercise, not runs", () => {
    const days = triedDaysByExercise([
      result("a", "2026-10-20T09:00:00"),
      result("a", "2026-10-20T18:00:00"),
      result("a", "2026-10-22T09:00:00"),
      result("b", "2026-10-21T09:00:00"),
    ]);
    expect(days.get("a")).toBe(2);
    expect(days.get("b")).toBe(1);
    expect(days.get("c")).toBeUndefined();
  });
});
