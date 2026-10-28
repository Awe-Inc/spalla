import { describe, expect, it } from "vitest";

import type { ExerciseResult, PracticeDay } from "./db";
import { earnedMedalTitle, longestStreak, medalProgress, medalSentence, newMedals, tierOf } from "./medals";

function run(exerciseId: string, accuracyPct: number, stars: 0 | 1 | 2 | 3 = 1): ExerciseResult {
  return { exerciseId, accuracyPct, stars, playedAt: 0, meanSignedCents: 0, bpm: 60, durationSeconds: 60 };
}

function day(key: string, minutes = 10): PracticeDay {
  return { day: key, minutes, exercisesPlayed: 1 };
}

function progressById(input: Parameters<typeof medalProgress>[0]) {
  return new Map(medalProgress(input).map((medal) => [medal.definition.id, medal]));
}

describe("medals", () => {
  it("awards tiers as the count crosses each threshold", () => {
    expect(tierOf(0, [10, 100, 500])).toBe(0);
    expect(tierOf(10, [10, 100, 500])).toBe(1);
    expect(tierOf(499, [10, 100, 500])).toBe(2);
    expect(tierOf(500, [10, 100, 500])).toBe(3);
  });

  it("keeps the longest streak ever, so a medal is never lost when the current streak breaks", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-10", "2026-10-11"].map((key) => day(key));
    expect(longestStreak(days)).toBe(3);
    expect(longestStreak([...days, day("2026-10-04", 0)])).toBe(3);
    expect(longestStreak(days, ["2026-10-04"])).toBe(3);
    expect(longestStreak([...days, day("2026-10-05")], ["2026-10-04"])).toBe(4);
  });

  it("counts each medal from results and practice days only", () => {
    const results = [run("scale-a", 95, 3), run("scale-a", 92, 3), run("scale-b", 70), run("musica:twinkle.xml", 91), run("musica:twinkle.xml", 60), run("musica:ode.xml", 88)];
    const days = [day("2026-10-01", 30), day("2026-10-02", 35.5)];
    const medals = progressById({ results, days });
    expect(medals.get("execucoes")?.count).toBe(6);
    expect(medals.get("dias")?.count).toBe(2);
    expect(medals.get("sequencia")?.count).toBe(2);
    expect(medals.get("tres-estrelas")?.count).toBe(1);
    expect(medals.get("limpas")?.count).toBe(3);
    expect(medals.get("minutos")?.count).toBe(65);
    expect(medals.get("musicas")?.count).toBe(2);
    expect(medals.get("musicas")?.tier).toBe(1);
    expect(medals.get("minutos")?.tier).toBe(1);
  });

  it("reports only the medals whose tier went up", () => {
    const before = medalProgress({ results: Array.from({ length: 9 }, () => run("x", 50)), days: [] });
    const after = medalProgress({ results: Array.from({ length: 10 }, () => run("x", 50)), days: [] });
    expect(newMedals(before, after)).toEqual([{ id: "execucoes", tier: 1 }]);
    expect(newMedals(after, after)).toEqual([]);
    expect(earnedMedalTitle({ id: "execucoes", tier: 1 })).toBe("Arco em movimento de bronze");
  });

  it("writes the progress sentence in Portuguese", () => {
    const medals = progressById({ results: [run("x", 50)], days: Array.from({ length: 7 }, (_, index) => day(`2026-10-0${index + 1}`)) });
    expect(medalSentence(medals.get("execucoes")!)).toBe("1 de 10 execuções para o bronze.");
    expect(medalSentence(medals.get("dias")!)).toBe("7 de 30 dias para a prata.");
    const gold = medalProgress({ results: Array.from({ length: 500 }, () => run("x", 50)), days: [] }).find((medal) => medal.definition.id === "execucoes")!;
    expect(medalSentence(gold)).toBe("500 execuções. Ouro: não tem mais o que provar.");
  });
});
