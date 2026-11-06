import type { TimedMeasure } from "./meter";
import type { ScoreStructure } from "./structure";

export function withReadTiming(structure: ScoreStructure, timed: readonly TimedMeasure[], bpm: number | null): ScoreStructure {
  const withTempo = bpm === null ? structure : { ...structure, bpm };
  if (timed.length !== structure.measures.length || timed.length === 0) return withTempo;
  const regular = timed.find((measure) => !measure.isPickup) ?? timed[0];
  return {
    ...withTempo,
    hasPickup: timed[0]?.isPickup ?? false,
    meter: { numerator: regular?.numerator ?? 4, denominator: regular?.denominator ?? 4 },
    measures: structure.measures.map((measure, index) => ({ ...measure, quarters: timed[index]?.quarters ?? 4 })),
  };
}
