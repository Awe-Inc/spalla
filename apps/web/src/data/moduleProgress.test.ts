import type { CurriculumModule, Exercise } from "@fretless/core";
import { describe, expect, it } from "vitest";

import type { ExerciseResult } from "./db";
import { moduleSummary } from "./moduleProgress";

function exercise(id: string, level: number, playable = true): Exercise {
  return { id, level, playable, moduleId: "escalas", title: id, kind: "scale" } as unknown as Exercise;
}

function run(exerciseId: string, stars: 0 | 1 | 2 | 3, accuracyPct: number, playedAt: number, bpm = 60, durationSeconds = 90): ExerciseResult {
  return { exerciseId, stars, accuracyPct, playedAt, bpm, durationSeconds, meanSignedCents: 0 };
}

const module = {
  id: "escalas",
  title: "Escalas",
  exercises: [exercise("a", 1), exercise("b", 1), exercise("c", 3), exercise("ref", 9, false)],
} as unknown as CurriculumModule;

describe("moduleSummary", () => {
  it("conta estrelas, tocados e minutos só dos exercícios tocáveis do módulo", () => {
    const summary = moduleSummary(module, [run("a", 2, 85, 1), run("a", 3, 97, 2), run("c", 1, 50, 3), run("outro", 3, 99, 4)]);
    expect(summary.stars).toBe(4);
    expect(summary.maxStars).toBe(9);
    expect(summary.played).toBe(2);
    expect(summary.playable).toBe(3);
    expect(summary.minutes).toBe(5);
    expect(summary.solidLevel).toBe(1);
  });

  it("agrupa por nível e guarda melhor resultado, última vez e número de execuções", () => {
    const summary = moduleSummary(module, [run("a", 2, 85, 10, 72), run("a", 1, 60, 20, 80)]);
    expect(summary.levels.map((group) => group.level)).toEqual([1, 3]);
    const a = summary.levels[0]!.exercises[0]!;
    expect(a).toMatchObject({ stars: 2, bestAccuracyPct: 85, bestBpm: 72, lastPlayedAt: 20, runs: 2 });
    const b = summary.levels[0]!.exercises[1]!;
    expect(b).toMatchObject({ stars: 0, bestAccuracyPct: null, lastPlayedAt: null, runs: 0 });
  });

  it("sem execuções não tem nível firme", () => {
    expect(moduleSummary(module, []).solidLevel).toBeNull();
  });
});
