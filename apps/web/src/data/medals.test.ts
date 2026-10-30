import { describe, expect, it } from "vitest";

import type { ExerciseResult, PracticeDay } from "./db";
import {
  comebacks,
  earlyDays,
  earnedMedalTitle,
  fullWeeks,
  longestStreak,
  MEDAL_GROUPS,
  medalProgress,
  MEDALS,
  medalSentence,
  medalShare,
  missingSentence,
  nearestMedals,
  newMedals,
  rankOf,
  rankSentence,
  RANKS,
  tierOf,
} from "./medals";

function run(exerciseId: string, accuracyPct: number, stars: 0 | 1 | 2 | 3 = 1): ExerciseResult {
  return { exerciseId, accuracyPct, stars, playedAt: 0, meanSignedCents: 0, bpm: 60, durationSeconds: 60 };
}

function at(exerciseId: string, accuracyPct: number, stars: 0 | 1 | 2 | 3, playedAt: number, meanSignedCents = 0): ExerciseResult {
  return { ...run(exerciseId, accuracyPct, stars), playedAt, meanSignedCents };
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

  it("gives every medal a group, so the gallery has no orphan", () => {
    const groups = new Set(MEDAL_GROUPS.map((group) => group.id));
    expect(MEDALS.every((medal) => groups.has(medal.group))).toBe(true);
    expect(new Set(MEDALS.map((medal) => medal.id)).size).toBe(MEDALS.length);
  });

  it("counts library songs as repertoire too", () => {
    const medals = progressById({ results: [run("biblioteca:ode", 80), run("musica:a.xml", 80), run("scales.1oct.69", 80)], days: [] });
    expect(medals.get("musicas")?.count).toBe(2);
  });

  it("counts fine tuning only when both the drift and the accuracy are good", () => {
    const results = [at("x", 85, 2, 1, 4), at("x", 85, 2, 2, -5), at("x", 70, 1, 3, 1), at("x", 95, 3, 4, 12)];
    expect(progressById({ results, days: [] }).get("afinacao-fina")?.count).toBe(2);
  });

  it("counts distinct scales and distinct items explored", () => {
    const results = [run("scales.1oct.69", 80), run("scales.1oct.69", 90), run("scales.2oct.62", 80), run("suzuki.twinkle.0", 80), run("musica:a.xml", 80)];
    const medals = progressById({ results, days: [] });
    expect(medals.get("escalas")?.count).toBe(2);
    expect(medals.get("explorador")?.count).toBe(4);
  });

  it("counts a comeback only when the first try was weak and three stars came later", () => {
    const results = [at("a", 50, 1, 1), at("a", 96, 3, 2), at("b", 90, 2, 1), at("b", 97, 3, 2), at("c", 40, 1, 1), at("c", 85, 2, 2)];
    expect(comebacks(results)).toBe(1);
    expect(comebacks([at("d", 97, 3, 5), at("d", 30, 1, 9)])).toBe(0);
  });

  it("counts long days and weeks with five practised days, Monday to Sunday", () => {
    const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-25"].map((key) => day(key, 31));
    const splitWeek = ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"].map((key) => day(key));
    expect(fullWeeks(week)).toBe(1);
    expect(fullWeeks(splitWeek)).toBe(0);
    expect(progressById({ results: [], days: week }).get("folego")?.count).toBe(5);
  });

  it("counts early mornings by local day, once per day", () => {
    const morning = new Date(2026, 9, 20, 7, 30).getTime();
    const sameMorning = new Date(2026, 9, 20, 8, 10).getTime();
    const night = new Date(2026, 9, 21, 22, 0).getTime();
    const dawn = new Date(2026, 9, 22, 3, 0).getTime();
    expect(earlyDays([at("x", 80, 1, morning), at("x", 80, 1, sameMorning), at("x", 80, 1, night), at("x", 80, 1, dawn)])).toBe(1);
  });

  it("measures the share toward the next tier from the last threshold", () => {
    const medals = progressById({ results: Array.from({ length: 55 }, () => run("x", 50)), days: [] });
    expect(medalShare(medals.get("execucoes")!)).toBeCloseTo(0.5);
    const gold = progressById({ results: Array.from({ length: 500 }, () => run("x", 50)), days: [] }).get("execucoes")!;
    expect(medalShare(gold)).toBe(1);
  });

  it("puts the medals closest to the next tier first and skips the gold ones", () => {
    const results = [...Array.from({ length: 8 }, (_, index) => run(`e${index}`, 50)), run("musica:a.xml", 50)];
    const nearest = nearestMedals(medalProgress({ results, days: [] }), 2);
    expect(nearest.map((medal) => medal.definition.id)).toEqual(["execucoes", "explorador"]);
    expect(missingSentence(nearest[0]!)).toBe("Falta 1 execução para Arco em movimento de bronze.");
  });

  it("climbs the orchestra ranks with the medal tiers earned", () => {
    expect(rankOf(0).current.title).toBe("Primeiro arco");
    expect(rankOf(2)).toMatchObject({ next: { title: "Aprendiz de estante" }, missing: 1 });
    expect(rankSentence(rankOf(2))).toBe("Falta 1 medalha para Aprendiz de estante.");
    expect(rankOf(9).current.title).toBe("Músico de fila");
    expect(rankSentence(rankOf(10))).toBe("Faltam 8 medalhas para Chefe de naipe.");
    const top = rankOf(MEDALS.length * 3);
    expect(top.current.title).toBe(RANKS[RANKS.length - 1]!.title);
    expect(top.next).toBeNull();
    expect(RANKS[RANKS.length - 1]!.minTiers).toBeLessThanOrEqual(MEDALS.length * 3);
  });
});
