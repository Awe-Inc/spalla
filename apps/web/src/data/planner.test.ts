import type { Exercise, ExerciseKind } from "@fretless/core";
import { describe, expect, it } from "vitest";

import type { ExerciseResult } from "./db";
import { nextOpenBlock, planSession, sessionProgress, studentLevel } from "./planner";
import { runsByExercise } from "./repetitions";
import { defaultRoutines, hasRepeatedNeighbours } from "./routines";

const DAY_MS = 86_400_000;
const now = Date.parse("2026-10-28T12:00:00");
const startOfDay = Date.parse("2026-10-28T00:00:00");

function today(...results: ExerciseResult[]) {
  return runsByExercise(results, startOfDay);
}

function exercise(id: string, kind: ExerciseKind, level = 1, playable = true): Exercise {
  return { id, kind, level, playable, moduleId: "m", title: id, subtitle: "", focus: "", howTo: "", source: "", defaultBpm: 60, minBpm: 40, maxBpm: 120, droneMidi: 0, metronome: false, freshEveryTime: false, recipe: {} } as unknown as Exercise;
}

function result(exerciseId: string, stars: 0 | 1 | 2 | 3, accuracyPct: number, daysAgo: number, bpm = 60): ExerciseResult {
  return { exerciseId, stars, accuracyPct, playedAt: now - daysAgo * DAY_MS, meanSignedCents: 0, bpm, durationSeconds: 60 };
}

const exercises = [
  exercise("tone-1", "long-tone"),
  exercise("ring-1", "ring-tone"),
  exercise("scale-1", "scale"),
  exercise("scale-2", "scale", 3),
  exercise("cross-1", "string-crossing"),
  exercise("piece-1", "piece"),
  exercise("piece-2", "piece"),
  exercise("piece-9", "piece", 5),
  exercise("read-1", "sight-reading"),
];

const routine = defaultRoutines().find((item) => item.durationMinutes === 25)!;

function plan(results: ExerciseResult[], lessonTasks: Parameters<typeof planSession>[0]["lessonTasks"] = [], playedToday = new Set<string>()) {
  const best = new Map(results.map((item) => [item.exerciseId, item]));
  return planSession({ routine, exercises, best, latest: best, lessonTasks, playedToday, now, day: "2026-10-28" });
}

describe("planSession", () => {
  it("keeps an exercise played today in its block even after the result improves", () => {
    const results = [result("piece-1", 3, 98, 0), result("piece-2", 2, 90, 3)];
    const planned = plan(results, [], new Set(["piece-1"]));
    const review = planned.find((item) => item.block.type === "revisao");
    expect(review?.exercise?.id).toBe("piece-1");
    expect(sessionProgress(planned, today(results[0]!)).done).toBe(1);
  });

  it("fills every block of the routine with a distinct exercise and never repeats a type", () => {
    const planned = plan([]);
    expect(planned).toHaveLength(routine.blocks.length);
    expect(hasRepeatedNeighbours(planned.map((item) => item.block))).toBe(false);
    const ids = planned.map((item) => item.exercise?.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps pieces far above the student's level out of the plan", () => {
    const planned = plan([]);
    expect(planned.map((item) => item.exercise?.id)).not.toContain("piece-9");
  });

  it("sends the weak piece to the review block and a fresh one to the new-piece block", () => {
    const planned = plan([result("piece-1", 1, 55, 2), result("piece-2", 3, 98, 1)]);
    const review = planned.find((item) => item.block.type === "revisao");
    const fresh = planned.find((item) => item.block.type === "peca-nova");
    expect(review?.exercise?.id).toBe("piece-1");
    expect(review?.reason).toMatch(/70%/);
    expect(fresh?.exercise).toBeNull();
  });

  it("proposes five more bpm as deliberate practice once a piece has two stars", () => {
    const planned = plan([result("scale-1", 2, 88, 3, 70)]);
    const scales = planned.find((item) => item.block.type === "escalas");
    expect(scales?.exercise?.id).toBe("scale-1");
    expect(scales?.targetBpm).toBe(75);
  });

  it("puts a lesson task first in its block", () => {
    const planned = plan([], [{ text: "Escala com duas notas por arco", blockType: "escalas", itemId: "scale-2", createdAt: now, doneAt: null }]);
    const scales = planned.find((item) => item.block.type === "escalas");
    expect(scales?.exercise?.id).toBe("scale-2");
    expect(scales?.fromLesson).toBe(true);
  });
});

describe("studentLevel", () => {
  it("is the highest level with two stars, starting at one", () => {
    expect(studentLevel(exercises, new Map())).toBe(1);
    expect(studentLevel(exercises, new Map([["scale-2", result("scale-2", 2, 85, 1)]]))).toBe(3);
  });
});

describe("session progress", () => {
  it("points at the first block not yet played today", () => {
    const planned = plan([]);
    const first = planned[0]!.exercise!.id;
    const firstRun = result(first, 1, 60, 0);
    expect(planned[0]!.block.goal).toBe("uma-vez");
    expect(nextOpenBlock(planned, today())?.exercise?.id).toBe(first);
    expect(nextOpenBlock(planned, today(firstRun))?.exercise?.id).toBe(planned[1]!.exercise!.id);
    expect(sessionProgress(planned, today(firstRun))).toEqual({ done: 1, total: planned.filter((item) => item.exercise).length });
  });

  it("keeps a clean-repetitions block open until the streak is complete", () => {
    const planned = plan([]);
    const scales = planned.find((item) => item.block.type === "escalas")!;
    const id = scales.exercise!.id;
    expect(scales.block).toMatchObject({ goal: "repeticoes-limpas", goalValue: 3 });
    const twoClean = today(result(id, 3, 96, 0), result(id, 3, 97, 0));
    expect(sessionProgress(planned, twoClean).done).toBe(0);
    const broken = today(result(id, 3, 96, 0), result(id, 3, 97, 0), result(id, 1, 50, 0), result(id, 3, 98, 0));
    expect(sessionProgress(planned, broken).done).toBe(0);
    const closed = today(result(id, 3, 96, 0), result(id, 3, 97, 0), result(id, 3, 98, 0));
    expect(sessionProgress(planned, closed).done).toBe(1);
    expect(nextOpenBlock(planned, closed)?.exercise?.id).not.toBe(id);
  });
});
