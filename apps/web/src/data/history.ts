import { accuracyTrend } from "./calendar";
import { localDayKey, type ExerciseResult } from "./db";
import { closedSeriesDays, DEFAULT_CLEAN_REPETITIONS } from "./repetitions";

export const HISTORY_RUNS = 12;
const STEADY_ACCURACY_PCT = 80;
const DRIFT_TOLERANCE_CENTS = 3;
const DAY_MS = 86_400_000;

export interface ExerciseHistory {
  runs: ExerciseResult[];
  recent: ExerciseResult[];
  count: number;
  days: number;
  best: ExerciseResult;
  latest: ExerciseResult;
  steadyBpm: number | null;
  meanDriftCents: number;
  trend: { first: number; last: number; delta: number } | null;
  closedSeries: number;
}

function betterRun(a: ExerciseResult, b: ExerciseResult): ExerciseResult {
  if (b.stars !== a.stars) return b.stars > a.stars ? b : a;
  return b.accuracyPct > a.accuracyPct ? b : a;
}

export function exerciseHistory(results: readonly ExerciseResult[], exerciseId: string): ExerciseHistory | null {
  const runs = results.filter((result) => result.exerciseId === exerciseId).sort((a, b) => a.playedAt - b.playedAt);
  if (runs.length === 0) return null;
  const recent = runs.slice(-HISTORY_RUNS);
  const steady = runs.filter((run) => run.accuracyPct >= STEADY_ACCURACY_PCT);
  return {
    runs,
    recent,
    count: runs.length,
    days: new Set(runs.map((run) => localDayKey(new Date(run.playedAt)))).size,
    best: runs.reduce(betterRun),
    latest: runs[runs.length - 1]!,
    steadyBpm: steady.length > 0 ? Math.max(...steady.map((run) => run.bpm)) : null,
    meanDriftCents: recent.reduce((sum, run) => sum + run.meanSignedCents, 0) / recent.length,
    trend: accuracyTrend(recent),
    closedSeries: closedSeriesDays(runs, DEFAULT_CLEAN_REPETITIONS),
  };
}

export function driftSentence(meanSignedCents: number): string {
  if (meanSignedCents > DRIFT_TOLERANCE_CENTS) return `Tendência de ${Math.round(meanSignedCents)} cents alto.`;
  if (meanSignedCents < -DRIFT_TOLERANCE_CENTS) return `Tendência de ${Math.round(-meanSignedCents)} cents baixo.`;
  return "Afinação centrada.";
}

export function unheardSentence(unheard: number): string | null {
  if (unheard <= 0) return null;
  const notes = unheard === 1 ? "1 nota não foi ouvida pelo microfone e não contou" : `${unheard} notas não foram ouvidas pelo microfone e não contaram`;
  return `${notes} contra você. Se o som saiu, aproxime o microfone ou confira o volume de entrada.`;
}

export function lastPlayedSentence(playedAt: number, now: number): string {
  const today = new Date(now);
  const played = new Date(playedAt);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfPlayed = new Date(played.getFullYear(), played.getMonth(), played.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfPlayed) / DAY_MS);
  if (daysAgo <= 0) return "hoje";
  if (daysAgo === 1) return "ontem";
  if (daysAgo < 7) return `há ${daysAgo} dias`;
  if (daysAgo < 30) {
    const weeks = Math.floor(daysAgo / 7);
    return weeks === 1 ? "há 1 semana" : `há ${weeks} semanas`;
  }
  return played.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function countSentence(history: ExerciseHistory): string {
  const times = history.count === 1 ? "1 vez" : `${history.count} vezes`;
  const days = history.days === 1 ? "1 dia" : `${history.days} dias`;
  return `Tocado ${times} em ${days}.`;
}

export function trendSentence(history: ExerciseHistory): string {
  if (!history.trend) return "Toque mais uma vez para ver a tendência.";
  if (history.trend.delta > 0) return `Subiu ${history.trend.delta} pontos de precisão nas últimas vezes.`;
  if (history.trend.delta < 0) return `Caiu ${Math.abs(history.trend.delta)} pontos nas últimas vezes; tente mais devagar.`;
  return "Precisão estável nas últimas vezes.";
}

export function tempoSentence(history: ExerciseHistory, writtenBpm: number): string {
  if (history.steadyBpm === null) return `Ainda sem execução com ${STEADY_ACCURACY_PCT}% ou mais.`;
  if (history.steadyBpm >= writtenBpm) return `Já segura ${STEADY_ACCURACY_PCT}% ou mais no andamento escrito (${writtenBpm} bpm).`;
  return `Segura ${STEADY_ACCURACY_PCT}% ou mais até ${history.steadyBpm} bpm; o escrito é ${writtenBpm}.`;
}

export function seriesSentence(history: ExerciseHistory): string | null {
  if (history.closedSeries === 0) return null;
  const series = history.closedSeries === 1 ? "1 série" : `${history.closedSeries} séries`;
  return `${series} de ${DEFAULT_CLEAN_REPETITIONS} limpas seguidas, em dias diferentes.`;
}
