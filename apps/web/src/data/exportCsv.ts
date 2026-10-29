import type { CurriculumModule, Exercise } from "@fretless/core";

import type { ExerciseResult } from "./db";

const SEPARATOR = ";";
const BOM = "﻿";
const NEEDS_QUOTES = /[;"\r\n]/;

export const CSV_HEADER = ["Data", "Hora", "Módulo", "Exercício", "Precisão (%)", "Desvio médio (cents)", "BPM", "Estrelas", "Duração (s)"] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function decimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

export function csvField(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function resultsToCsv(results: readonly ExerciseResult[], exercises: readonly Exercise[], modules: readonly CurriculumModule[]): string {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const rows = [...results]
    .sort((a, b) => a.playedAt - b.playedAt)
    .map((result) => {
      const playedAt = new Date(result.playedAt);
      const exercise = exerciseById.get(result.exerciseId);
      const module = exercise ? moduleById.get(exercise.moduleId) : undefined;
      return [
        `${playedAt.getFullYear()}-${pad(playedAt.getMonth() + 1)}-${pad(playedAt.getDate())}`,
        `${pad(playedAt.getHours())}:${pad(playedAt.getMinutes())}`,
        module?.title ?? "",
        exercise?.title ?? result.exerciseId,
        decimal(result.accuracyPct, 1),
        decimal(result.meanSignedCents, 1),
        String(Math.round(result.bpm)),
        String(result.stars),
        String(Math.round(result.durationSeconds)),
      ];
    });
  return BOM + [CSV_HEADER, ...rows].map((row) => row.map(csvField).join(SEPARATOR)).join("\r\n") + "\r\n";
}

export function csvFileName(now = new Date()): string {
  return `spalla-historico-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}
