import type { NoteJudgement, Score } from "@fretless/core";

export interface MeasureStat {
  measureIndex: number;
  measureNumber: number;
  notes: number;
  judged: number;
  hits: number;
  misses: number;
  accuracyPct: number | null;
  meanSignedCents: number;
}

export const HARD_MEASURE_ACCURACY_PCT = 70;

export function measureStats(score: Score, judgements: readonly NoteJudgement[]): MeasureStat[] {
  const stats = score.measures.map<MeasureStat>((measure, measureIndex) => ({
    measureIndex,
    measureNumber: measure.number,
    notes: 0,
    judged: 0,
    hits: 0,
    misses: 0,
    accuracyPct: null,
    meanSignedCents: 0,
  }));
  score.events.forEach((event) => {
    const stat = stats[event.measureIndex];
    if (stat && !event.isRest) stat.notes += 1;
  });
  const centsSum = new Map<number, number>();
  for (const judgement of judgements) {
    const event = score.events[judgement.eventIndex];
    const stat = event ? stats[event.measureIndex] : undefined;
    if (!stat) continue;
    stat.judged += 1;
    if (judgement.grade === "Miss") stat.misses += 1;
    else {
      stat.hits += 1;
      centsSum.set(stat.measureIndex, (centsSum.get(stat.measureIndex) ?? 0) + judgement.meanCents);
    }
  }
  return stats.map((stat) => ({
    ...stat,
    accuracyPct: stat.judged > 0 ? (stat.hits / stat.judged) * 100 : null,
    meanSignedCents: stat.hits > 0 ? (centsSum.get(stat.measureIndex) ?? 0) / stat.hits : 0,
  }));
}

export function hardestRange(stats: readonly MeasureStat[]): { firstIndex: number; lastIndex: number } | null {
  const hard = stats.filter((stat) => stat.accuracyPct !== null && stat.accuracyPct < HARD_MEASURE_ACCURACY_PCT);
  if (hard.length === 0) return null;
  const worst = hard.reduce((lowest, stat) => ((stat.accuracyPct ?? 100) < (lowest.accuracyPct ?? 100) ? stat : lowest));
  let firstIndex = worst.measureIndex;
  let lastIndex = worst.measureIndex;
  const isHard = (index: number) => hard.some((stat) => stat.measureIndex === index);
  while (firstIndex > 0 && isHard(firstIndex - 1) && lastIndex - firstIndex < 3) firstIndex -= 1;
  while (lastIndex < stats.length - 1 && isHard(lastIndex + 1) && lastIndex - firstIndex < 3) lastIndex += 1;
  if (lastIndex === firstIndex && lastIndex < stats.length - 1) lastIndex += 1;
  return { firstIndex, lastIndex };
}

export function measureTone(stat: MeasureStat): "unplayed" | "clean" | "shaky" | "hard" {
  if (stat.accuracyPct === null) return "unplayed";
  if (stat.accuracyPct >= 90) return "clean";
  if (stat.accuracyPct >= HARD_MEASURE_ACCURACY_PCT) return "shaky";
  return "hard";
}
