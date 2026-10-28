import { describe, expect, it } from "vitest";

import type { ExerciseResult } from "./db";
import { countSentence, driftSentence, exerciseHistory, HISTORY_RUNS, lastPlayedSentence, seriesSentence, tempoSentence, trendSentence } from "./history";

const DAY_MS = 86_400_000;
const now = Date.parse("2026-10-28T12:00:00");

function run(accuracyPct: number, daysAgo: number, extra: Partial<ExerciseResult> = {}): ExerciseResult {
  return { exerciseId: "scale-1", accuracyPct, stars: accuracyPct >= 95 ? 3 : accuracyPct >= 80 ? 2 : 1, playedAt: now - daysAgo * DAY_MS, meanSignedCents: 0, bpm: 60, durationSeconds: 60, ...extra };
}

describe("exerciseHistory", () => {
  it("returns null for an exercise never played", () => {
    expect(exerciseHistory([run(90, 0, { exerciseId: "other" })], "scale-1")).toBeNull();
  });

  it("orders runs, counts days, keeps the best and the latest and the steadiest tempo", () => {
    const history = exerciseHistory([run(70, 2, { bpm: 50 }), run(96, 1, { bpm: 60 }), run(85, 0, { bpm: 72 }), run(60, 0, { bpm: 90, meanSignedCents: -12 })], "scale-1")!;
    expect(history.count).toBe(4);
    expect(history.days).toBe(3);
    expect(history.runs.map((item) => item.accuracyPct)).toEqual([70, 96, 85, 60]);
    expect(history.best.accuracyPct).toBe(96);
    expect(history.latest.accuracyPct).toBe(60);
    expect(history.steadyBpm).toBe(72);
    expect(history.meanDriftCents).toBe(-3);
    expect(history.trend).toEqual({ first: 70, last: 60, delta: -10 });
  });

  it("limits the recent runs and counts closed series of clean repetitions", () => {
    const many = Array.from({ length: HISTORY_RUNS + 5 }, (_, index) => run(96, 0, { playedAt: now - index * 60_000 }));
    const history = exerciseHistory(many, "scale-1")!;
    expect(history.recent).toHaveLength(HISTORY_RUNS);
    expect(history.closedSeries).toBe(1);
    expect(exerciseHistory([run(96, 1), run(40, 1), run(96, 1)], "scale-1")!.closedSeries).toBe(0);
    expect(exerciseHistory([run(50, 0)], "scale-1")!.steadyBpm).toBeNull();
  });
});

describe("sentences", () => {
  it("say when the exercise was last played", () => {
    expect(lastPlayedSentence(now - 60_000, now)).toBe("hoje");
    expect(lastPlayedSentence(now - DAY_MS, now)).toBe("ontem");
    expect(lastPlayedSentence(now - 3 * DAY_MS, now)).toBe("há 3 dias");
    expect(lastPlayedSentence(now - 8 * DAY_MS, now)).toBe("há 1 semana");
    expect(lastPlayedSentence(now - 20 * DAY_MS, now)).toBe("há 2 semanas");
    expect(lastPlayedSentence(now - 40 * DAY_MS, now)).toMatch(/^18 de set/);
  });

  it("describe count, trend, tempo and drift in Portuguese", () => {
    const single = exerciseHistory([run(50, 0)], "scale-1")!;
    expect(countSentence(single)).toBe("Tocado 1 vez em 1 dia.");
    expect(trendSentence(single)).toBe("Toque mais uma vez para ver a tendência.");
    expect(tempoSentence(single, 80)).toBe("Ainda sem execução com 80% ou mais.");
    expect(seriesSentence(single)).toBeNull();

    const improving = exerciseHistory([run(70, 2), run(85, 1, { bpm: 60 }), run(96, 0, { bpm: 80 })], "scale-1")!;
    expect(countSentence(improving)).toBe("Tocado 3 vezes em 3 dias.");
    expect(trendSentence(improving)).toBe("Subiu 26 pontos de precisão nas últimas vezes.");
    expect(tempoSentence(improving, 80)).toBe("Já segura 80% ou mais no andamento escrito (80 bpm).");
    expect(tempoSentence(improving, 100)).toBe("Segura 80% ou mais até 80 bpm; o escrito é 100.");

    const falling = exerciseHistory([run(90, 1), run(70, 0)], "scale-1")!;
    expect(trendSentence(falling)).toBe("Caiu 20 pontos nas últimas vezes; tente mais devagar.");
    expect(trendSentence(exerciseHistory([run(90, 1), run(90, 0)], "scale-1")!)).toBe("Precisão estável nas últimas vezes.");

    const closed = exerciseHistory([run(96, 1), run(96, 1), run(96, 1), run(96, 0), run(96, 0), run(96, 0)], "scale-1")!;
    expect(seriesSentence(closed)).toBe("2 séries de 3 limpas seguidas, em dias diferentes.");
  });

  it("names the drift direction", () => {
    expect(driftSentence(8.4)).toBe("Tendência de 8 cents alto.");
    expect(driftSentence(-5)).toBe("Tendência de 5 cents baixo.");
    expect(driftSentence(2)).toBe("Afinação centrada.");
  });
});
