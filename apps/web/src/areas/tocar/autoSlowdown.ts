import type { GameStats, NoteJudgement, Score } from "@fretless/core";

import { HARD_MEASURE_ACCURACY_PCT, measureStats, type MeasureStat } from "./measureMap";
import { clampBpm, roundToStep, SLOWDOWN_ACCURACY_PCT, SLOWDOWN_FACTOR, type TempoLimits } from "./tempo";

export const AUTO_SLOWDOWN_MIN_JUDGED = 3;

export interface Slowdown {
  fromBpm: number;
  bpm: number;
  measureNumber: number | null;
}

function hardestMeasure(perMeasure: readonly MeasureStat[]): MeasureStat | null {
  const hard = perMeasure.filter((stat) => stat.judged >= AUTO_SLOWDOWN_MIN_JUDGED && stat.accuracyPct !== null && stat.accuracyPct < HARD_MEASURE_ACCURACY_PCT);
  if (hard.length === 0) return null;
  return hard.reduce((worst, stat) => ((stat.accuracyPct ?? 100) < (worst.accuracyPct ?? 100) ? stat : worst));
}

export function autoSlowdown(score: Score, judgements: readonly NoteJudgement[], stats: GameStats, bpm: number, limits: TempoLimits): Slowdown | null {
  const worst = hardestMeasure(measureStats(score, judgements));
  const isRoughRun = stats.judgedNotes >= AUTO_SLOWDOWN_MIN_JUDGED && stats.accuracyPct < SLOWDOWN_ACCURACY_PCT;
  if (!worst && !isRoughRun) return null;
  const slower = clampBpm(roundToStep(bpm * SLOWDOWN_FACTOR), limits);
  if (slower >= bpm) return null;
  return { fromBpm: bpm, bpm: slower, measureNumber: worst?.measureNumber ?? null };
}

export function slowdownSentence(slowdown: Slowdown): string {
  const reason = slowdown.measureNumber === null ? "Ficou corrido." : `O compasso ${slowdown.measureNumber} ficou difícil.`;
  return `${reason} O andamento baixou para ${slowdown.bpm} bpm na próxima.`;
}
