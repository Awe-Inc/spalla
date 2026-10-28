import { localDayKey, type ExerciseResult, type RoutineBlock } from "./db";

export const CLEAN_RUN_ACCURACY_PCT = 90;
export const DEFAULT_CLEAN_REPETITIONS = 3;
export const SERIES_BEFORE_TEMPO_RAISE = 3;

export interface GoalProgress {
  done: number;
  total: number;
  complete: boolean;
  recentClean: boolean[];
}

export function isCleanRun(result: ExerciseResult): boolean {
  return result.accuracyPct >= CLEAN_RUN_ACCURACY_PCT;
}

export function runsByExercise(results: readonly ExerciseResult[], since: number): Map<string, ExerciseResult[]> {
  const today = results.filter((result) => result.playedAt >= since).sort((a, b) => a.playedAt - b.playedAt);
  return today.reduce((runs, result) => {
    runs.set(result.exerciseId, [...(runs.get(result.exerciseId) ?? []), result]);
    return runs;
  }, new Map<string, ExerciseResult[]>());
}

export function cleanStreak(runs: readonly ExerciseResult[]): number {
  let streak = 0;
  for (let index = runs.length - 1; index >= 0 && isCleanRun(runs[index]!); index -= 1) streak += 1;
  return streak;
}

function longestCleanStreak(runs: readonly ExerciseResult[]): number {
  return runs.reduce(
    ({ longest, current }, run) => {
      const next = isCleanRun(run) ? current + 1 : 0;
      return { longest: Math.max(longest, next), current: next };
    },
    { longest: 0, current: 0 },
  ).longest;
}

export function closedSeriesDays(runs: readonly ExerciseResult[], goalValue: number): number {
  const byDay = [...runs].sort((a, b) => a.playedAt - b.playedAt).reduce((days, run) => {
    const day = localDayKey(new Date(run.playedAt));
    return days.set(day, [...(days.get(day) ?? []), run]);
  }, new Map<string, ExerciseResult[]>());
  return [...byDay.values()].filter((dayRuns) => longestCleanStreak(dayRuns) >= goalValue).length;
}

export function shouldRaiseTempo(block: RoutineBlock, allRuns: readonly ExerciseResult[]): boolean {
  return block.goal === "repeticoes-limpas" && closedSeriesDays(allRuns, block.goalValue) >= SERIES_BEFORE_TEMPO_RAISE;
}

function minutesPlayed(runs: readonly ExerciseResult[]): number {
  return runs.reduce((sum, run) => sum + run.durationSeconds, 0) / 60;
}

export function goalProgress(block: RoutineBlock, runs: readonly ExerciseResult[]): GoalProgress {
  const recentClean = runs.slice(-Math.max(block.goalValue, 1)).map(isCleanRun);
  switch (block.goal) {
    case "repeticoes-limpas": {
      const streak = cleanStreak(runs);
      return { done: Math.min(streak, block.goalValue), total: block.goalValue, complete: streak >= block.goalValue, recentClean };
    }
    case "estrelas": {
      const stars = Math.max(0, ...runs.map((run) => run.stars));
      return { done: Math.min(stars, block.goalValue), total: block.goalValue, complete: stars >= block.goalValue, recentClean };
    }
    case "tempo": {
      const minutes = minutesPlayed(runs);
      return { done: Math.min(Math.floor(minutes), block.durationMinutes), total: block.durationMinutes, complete: minutes >= block.durationMinutes, recentClean };
    }
    case "uma-vez":
      return { done: runs.length > 0 ? 1 : 0, total: 1, complete: runs.length > 0, recentClean };
  }
}

export function goalSentence(block: RoutineBlock, progress: GoalProgress): string | null {
  switch (block.goal) {
    case "repeticoes-limpas":
      return progress.complete ? `${block.goalValue} limpas seguidas, série fechada` : `${progress.done} de ${block.goalValue} limpas seguidas`;
    case "estrelas":
      return progress.complete ? `${block.goalValue} ${block.goalValue === 1 ? "estrela" : "estrelas"}, meta batida` : `${progress.done} de ${block.goalValue} estrelas`;
    case "tempo":
      return progress.complete ? `${block.durationMinutes} min feitos` : `${progress.done} de ${block.durationMinutes} min`;
    case "uma-vez":
      return null;
  }
}
