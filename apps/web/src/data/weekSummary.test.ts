import { describe, expect, it } from "vitest";

import type { ExerciseResult, LessonTask, PracticeDay } from "./db";
import { weekSummary, weekSummaryLines, weekWindow } from "./weekSummary";

const wednesday = new Date(2026, 9, 28, 10);

function at(day: string, hour = 10): number {
  return new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).getTime();
}

function result(exerciseId: string, day: string, accuracyPct: number, meanSignedCents = 0): ExerciseResult {
  return { exerciseId, playedAt: at(day), accuracyPct, meanSignedCents, bpm: 60, stars: 1, durationSeconds: 60 };
}

describe("weekWindow", () => {
  it("covers the seven days ending today without a lesson day", () => {
    expect(weekWindow(null, wednesday)).toEqual({ from: "2026-10-22", to: "2026-10-28", dayCount: 7 });
  });

  it("starts the day after the last lesson and runs a full week on the lesson day itself", () => {
    expect(weekWindow(1, wednesday)).toEqual({ from: "2026-10-27", to: "2026-10-28", dayCount: 2 });
    expect(weekWindow(4, wednesday)).toEqual({ from: "2026-10-23", to: "2026-10-28", dayCount: 6 });
    expect(weekWindow(3, wednesday)).toEqual({ from: "2026-10-22", to: "2026-10-28", dayCount: 7 });
  });
});

describe("weekSummary", () => {
  const window = weekWindow(3, wednesday);
  const days: PracticeDay[] = [
    { day: "2026-10-21", minutes: 30, exercisesPlayed: 3 },
    { day: "2026-10-24", minutes: 20.4, exercisesPlayed: 2 },
    { day: "2026-10-26", minutes: 0, exercisesPlayed: 0 },
    { day: "2026-10-28", minutes: 15, exercisesPlayed: 1 },
  ];
  const results: ExerciseResult[] = [
    result("scales.a", "2026-10-21", 40, -30),
    result("scales.a", "2026-10-24", 90, -12),
    result("scales.a", "2026-10-28", 70, -8),
    result("suzuki.twinkle", "2026-10-24", 60, -10),
  ];
  const tasks: LessonTask[] = [
    { id: 1, text: "feita na semana", blockType: "escalas", itemId: null, createdAt: 0, doneAt: at("2026-10-25") },
    { id: 2, text: "feita antes", blockType: "escalas", itemId: null, createdAt: 0, doneAt: at("2026-10-20") },
    { id: 3, text: "aberta", blockType: "livre", itemId: null, createdAt: 0, doneAt: null },
  ];

  it("counts only what happened inside the window and finds the weakest exercise and the drift", () => {
    expect(weekSummary({ window, days, results, tasks })).toEqual({
      ...window,
      minutes: 35,
      daysPracticed: 2,
      runs: 3,
      exercisesPlayed: 2,
      tasksDone: 1,
      tasksOpen: 1,
      weakest: { exerciseId: "suzuki.twinkle", accuracyPct: 60 },
      drift: "baixo",
    });
  });

  it("writes the lines a teacher would read", () => {
    const summary = weekSummary({ window, days, results, tasks });
    expect(weekSummaryLines(summary, (id) => (id === "suzuki.twinkle" ? "Twinkle - Tema" : null))).toEqual([
      "De 22/10 a 28/10",
      "Praticou 2 de 7 dias, 35 minutos no total.",
      "3 execuções de 2 exercícios.",
      "Tarefas da aula: 1 feita, 1 aberta.",
      "Onde errou mais: Twinkle - Tema (60% de afinação).",
      "Tendência: as notas saem baixas.",
    ]);
  });

  it("says so when nothing was played", () => {
    const empty = weekSummary({ window: weekWindow(2, wednesday), days: [], results: [], tasks });
    expect(empty.weakest).toBeNull();
    expect(empty.drift).toBeNull();
    expect(weekSummaryLines(empty, () => null)).toEqual(["Hoje, 28/10", "Nenhum exercício tocado neste período."]);
  });
});
