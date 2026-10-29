import type { CurriculumModule, Exercise } from "@fretless/core";

import { bestResultsByExercise, type ExerciseResult } from "./db";

const SOLID_STARS = 2;
const MAX_STARS = 3;
const SECONDS_PER_MINUTE = 60;

export interface ExerciseSummary {
  exercise: Exercise;
  stars: 0 | 1 | 2 | 3;
  bestAccuracyPct: number | null;
  bestBpm: number | null;
  lastPlayedAt: number | null;
  runs: number;
}

export interface LevelGroup {
  level: number;
  exercises: ExerciseSummary[];
}

export interface ModuleSummary {
  stars: number;
  maxStars: number;
  played: number;
  playable: number;
  minutes: number;
  solidLevel: number | null;
  levels: LevelGroup[];
}

function summarize(exercise: Exercise, runs: readonly ExerciseResult[], best: ExerciseResult | undefined): ExerciseSummary {
  return {
    exercise,
    stars: best?.stars ?? 0,
    bestAccuracyPct: best ? best.accuracyPct : null,
    bestBpm: best ? best.bpm : null,
    lastPlayedAt: runs.length > 0 ? Math.max(...runs.map((run) => run.playedAt)) : null,
    runs: runs.length,
  };
}

export function moduleSummary(module: CurriculumModule, results: readonly ExerciseResult[]): ModuleSummary {
  const playable = module.exercises.filter((exercise) => exercise.playable);
  const ids = new Set(playable.map((exercise) => exercise.id));
  const moduleRuns = results.filter((result) => ids.has(result.exerciseId));
  const best = bestResultsByExercise(moduleRuns);
  const summaries = playable.map((exercise) =>
    summarize(
      exercise,
      moduleRuns.filter((run) => run.exerciseId === exercise.id),
      best.get(exercise.id),
    ),
  );
  const levels = [...new Set(summaries.map((summary) => summary.exercise.level))]
    .sort((a, b) => a - b)
    .map((level) => ({ level, exercises: summaries.filter((summary) => summary.exercise.level === level) }));
  const solid = summaries.filter((summary) => summary.stars >= SOLID_STARS).map((summary) => summary.exercise.level);
  return {
    stars: summaries.reduce((sum, summary) => sum + summary.stars, 0),
    maxStars: playable.length * MAX_STARS,
    played: summaries.filter((summary) => summary.runs > 0).length,
    playable: playable.length,
    minutes: Math.round(moduleRuns.reduce((sum, run) => sum + run.durationSeconds, 0) / SECONDS_PER_MINUTE),
    solidLevel: solid.length > 0 ? Math.max(...solid) : null,
    levels,
  };
}
