import type { Exercise, Score } from "@fretless/core";

export const BPM_STEP = 5;
export const SLOWDOWN_ACCURACY_PCT = 60;
export const SLOWDOWN_FACTOR = 0.85;
export const SPEEDUP_ACCURACY_PCT = 90;
export const MIN_BPM_FLOOR = 30;
export const MAX_BPM_CEILING = 240;

export interface TempoLimits {
  writtenBpm: number;
  minBpm: number;
  maxBpm: number;
}

export function tempoLimits(score: Score, exercise: Exercise | null): TempoLimits {
  const writtenBpm = Math.round(score.beatsPerMinute / score.tempoScale);
  if (exercise && exercise.minBpm > 0 && exercise.maxBpm >= exercise.minBpm) {
    return { writtenBpm, minBpm: exercise.minBpm, maxBpm: exercise.maxBpm };
  }
  return {
    writtenBpm,
    minBpm: Math.max(MIN_BPM_FLOOR, Math.round(writtenBpm * 0.4)),
    maxBpm: Math.min(MAX_BPM_CEILING, Math.round(writtenBpm * 1.5)),
  };
}

export function clampBpm(bpm: number, limits: TempoLimits): number {
  return Math.min(limits.maxBpm, Math.max(limits.minBpm, Math.round(bpm)));
}

export function roundToStep(bpm: number): number {
  return Math.round(bpm / BPM_STEP) * BPM_STEP;
}

export function tempoScaleFor(bpm: number, limits: TempoLimits): number {
  return limits.writtenBpm > 0 ? bpm / limits.writtenBpm : 1;
}

export function currentBpm(score: Score): number {
  return Math.round(score.beatsPerMinute);
}

export type TempoAdvice =
  | { kind: "slow-down"; bpm: number }
  | { kind: "speed-up"; bpm: number }
  | { kind: "keep" };

export function adviseTempo(accuracyPct: number, bpm: number, limits: TempoLimits): TempoAdvice {
  if (accuracyPct < SLOWDOWN_ACCURACY_PCT && bpm > limits.minBpm) {
    const slower = clampBpm(roundToStep(bpm * SLOWDOWN_FACTOR), limits);
    if (slower < bpm) return { kind: "slow-down", bpm: slower };
  }
  if (accuracyPct >= SPEEDUP_ACCURACY_PCT && bpm < limits.writtenBpm) {
    return { kind: "speed-up", bpm: clampBpm(Math.min(limits.writtenBpm, bpm + BPM_STEP), limits) };
  }
  return { kind: "keep" };
}
