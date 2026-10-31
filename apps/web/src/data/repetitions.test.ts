import { describe, expect, it } from "vitest";

import type { ExerciseResult, RoutineBlock } from "./db";
import { cleanStreak, closedSeriesDays, goalProgress, goalSentence, isCleanRun, lastCleanBpm, runsByExercise, shouldRaiseTempo } from "./repetitions";

const startOfDay = Date.parse("2026-10-28T00:00:00");

function run(accuracyPct: number, minutesIntoDay = 0, exerciseId = "scale-1", stars: 0 | 1 | 2 | 3 = 1): ExerciseResult {
  return { exerciseId, accuracyPct, stars, playedAt: startOfDay + minutesIntoDay * 60_000, meanSignedCents: 0, bpm: 60, durationSeconds: 60 };
}

function block(goal: RoutineBlock["goal"], goalValue: number, durationMinutes = 4): RoutineBlock {
  return { type: "tecnica", itemId: "scale-1", goal, goalValue, durationMinutes };
}

describe("isCleanRun", () => {
  it("counts 90% or better and nothing below", () => {
    expect(isCleanRun(run(90))).toBe(true);
    expect(isCleanRun(run(89.9))).toBe(false);
  });
});

describe("lastCleanBpm", () => {
  it("returns the tempo of the most recent clean run, ignoring weaker ones after it", () => {
    const clean = { ...run(95, 1), bpm: 72 };
    const olderClean = { ...run(92, 0), bpm: 60 };
    const weakLater = { ...run(50, 2), bpm: 90 };
    expect(lastCleanBpm([weakLater, clean, olderClean])).toBe(72);
    expect(lastCleanBpm([weakLater])).toBeNull();
  });
});

describe("runsByExercise", () => {
  it("keeps only today's runs, in playing order, per exercise", () => {
    const yesterday = { ...run(99), playedAt: startOfDay - 1 };
    const grouped = runsByExercise([run(80, 20), yesterday, run(95, 5), run(70, 1, "ring-1")], startOfDay);
    expect(grouped.get("scale-1")?.map((item) => item.accuracyPct)).toEqual([95, 80]);
    expect(grouped.get("ring-1")).toHaveLength(1);
  });
});

describe("cleanStreak", () => {
  it("counts clean runs from the most recent backwards and resets on a miss", () => {
    expect(cleanStreak([run(95), run(92), run(91)])).toBe(3);
    expect(cleanStreak([run(95), run(60), run(91)])).toBe(1);
    expect(cleanStreak([run(95), run(92), run(60)])).toBe(0);
    expect(cleanStreak([])).toBe(0);
  });
});

describe("goalProgress", () => {
  it("closes a clean-repetitions block only with the full streak in a row", () => {
    const target = block("repeticoes-limpas", 3);
    expect(goalProgress(target, [run(95), run(92)])).toMatchObject({ done: 2, total: 3, complete: false });
    expect(goalProgress(target, [run(95), run(60), run(92), run(94), run(99)])).toMatchObject({ done: 3, complete: true, recentClean: [true, true, true] });
    expect(goalProgress(target, [run(95), run(92), run(60)])).toMatchObject({ done: 0, complete: false, recentClean: [true, true, false] });
  });

  it("treats one play as done for uma-vez and uses best stars for estrelas", () => {
    expect(goalProgress(block("uma-vez", 1), [])).toMatchObject({ done: 0, complete: false });
    expect(goalProgress(block("uma-vez", 1), [run(40)])).toMatchObject({ done: 0, complete: false });
    expect(goalProgress(block("uma-vez", 1), [run(40), run(60)])).toMatchObject({ done: 1, complete: true });
    expect(goalProgress(block("estrelas", 2), [run(50, 0, "scale-1", 1), run(85, 1, "scale-1", 2)])).toMatchObject({ done: 2, complete: true });
  });

  it("keeps a closed series closed when a weaker run comes after it", () => {
    const progress = goalProgress(block("repeticoes-limpas", 3), [run(95), run(92), run(91), run(40)]);
    expect(progress).toMatchObject({ done: 3, complete: true });
    expect(goalSentence(block("repeticoes-limpas", 3), progress)).toBe("3 limpas seguidas, série fechada");
  });

  it("tells why a single weak run does not close a one-time block", () => {
    expect(goalSentence(block("uma-vez", 1), goalProgress(block("uma-vez", 1), [run(40)]))).toBe("Uma passada com 60% fecha o bloco");
  });

  it("sums played minutes for a tempo block", () => {
    const progress = goalProgress(block("tempo", 0, 3), [run(50), run(50), { ...run(50), durationSeconds: 30 }]);
    expect(progress).toMatchObject({ done: 2, total: 3, complete: false });
  });
});

describe("closedSeriesDays", () => {
  const dayMinutes = 24 * 60;
  const closedDay = (dayOffset: number) => [run(95, dayOffset * dayMinutes), run(92, dayOffset * dayMinutes + 1), run(99, dayOffset * dayMinutes + 2)];

  it("counts the days in which the full streak was reached at some point", () => {
    const brokenToday = [run(95, 0), run(92, 1), run(50, 2), run(95, 3)];
    expect(closedSeriesDays([...brokenToday, ...closedDay(1), ...closedDay(2)], 3)).toBe(2);
    expect(closedSeriesDays([run(95), run(92), run(99), run(40, 5)], 3)).toBe(1);
    expect(closedSeriesDays([], 3)).toBe(0);
  });

  it("asks for a tempo raise only after three closed series on different days", () => {
    const target = block("repeticoes-limpas", 3);
    expect(shouldRaiseTempo(target, [...closedDay(0), ...closedDay(1)])).toBe(false);
    expect(shouldRaiseTempo(target, [...closedDay(0), ...closedDay(1), ...closedDay(2)])).toBe(true);
    expect(shouldRaiseTempo(block("uma-vez", 1), [...closedDay(0), ...closedDay(1), ...closedDay(2)])).toBe(false);
  });
});

describe("goalSentence", () => {
  it("says where the series stands in Portuguese", () => {
    const target = block("repeticoes-limpas", 3);
    expect(goalSentence(target, goalProgress(target, [run(95)]))).toBe("1 de 3 limpas seguidas");
    expect(goalSentence(target, goalProgress(target, [run(95), run(95), run(95)]))).toBe("3 limpas seguidas, série fechada");
    expect(goalSentence(block("uma-vez", 1), goalProgress(block("uma-vez", 1), []))).toBeNull();
  });
});
