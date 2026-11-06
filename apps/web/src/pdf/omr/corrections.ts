import type { ScoreMeasure } from "./structure";

export type MeasureFlag = "repeatStart" | "repeatEnd" | "segno" | "coda" | "toCoda" | "dalSegno" | "daCapo" | "fine";

const MARKS_OF_THE_START: readonly MeasureFlag[] = ["repeatStart", "segno", "coda"];
const MARKS_OF_THE_END: readonly MeasureFlag[] = ["repeatEnd", "toCoda", "dalSegno", "daCapo", "fine"];

function without(measure: ScoreMeasure, flags: readonly MeasureFlag[]): ScoreMeasure {
  const next: Record<string, unknown> = { ...measure };
  for (const flag of flags) delete next[flag];
  return next as unknown as ScoreMeasure;
}

function replaced(measures: readonly ScoreMeasure[], index: number, measure: ScoreMeasure): ScoreMeasure[] {
  return measures.map((current, position) => (position === index ? measure : current));
}

export function toggleFlag(measures: readonly ScoreMeasure[], index: number, flag: MeasureFlag): ScoreMeasure[] {
  const measure = measures[index];
  if (!measure) return [...measures];
  return replaced(measures, index, measure[flag] ? without(measure, [flag]) : { ...measure, [flag]: true });
}

export function toggleEnding(measures: readonly ScoreMeasure[], index: number, ending: number): ScoreMeasure[] {
  const measure = measures[index];
  if (!measure) return [...measures];
  const current = measure.endings ?? [];
  const endings = current.includes(ending) ? current.filter((value) => value !== ending) : [...current, ending].sort((a, b) => a - b);
  const { endings: _previous, ...rest } = measure;
  return replaced(measures, index, endings.length > 0 ? { ...rest, endings } : rest);
}

export function canMergeWithNext(measures: readonly ScoreMeasure[], index: number): boolean {
  const measure = measures[index];
  const next = measures[index + 1];
  return Boolean(measure && next && measure.page === next.page && measure.system === next.system);
}

export function mergeWithNext(measures: readonly ScoreMeasure[], index: number): ScoreMeasure[] {
  const measure = measures[index];
  const next = measures[index + 1];
  if (!measure || !next || !canMergeWithNext(measures, index)) return [...measures];
  const firstKeeps = without(measure, MARKS_OF_THE_END);
  const secondKeeps = without(next, MARKS_OF_THE_START);
  const merged: ScoreMeasure = { ...secondKeeps, ...firstKeeps, x1: next.x1, ...Object.fromEntries(MARKS_OF_THE_END.filter((flag) => next[flag]).map((flag) => [flag, true])) };
  return measures.flatMap((current, position) => {
    if (position === index) return [merged];
    return position === index + 1 ? [] : [current];
  });
}

export function splitAt(measures: readonly ScoreMeasure[], index: number, x: number): ScoreMeasure[] {
  const measure = measures[index];
  if (!measure || x <= measure.x0 || x >= measure.x1) return [...measures];
  const left: ScoreMeasure = { ...without(measure, MARKS_OF_THE_END), x1: x };
  const right: ScoreMeasure = { ...without(measure, MARKS_OF_THE_START), x0: x };
  return measures.flatMap((current, position) => (position === index ? [left, right] : [current]));
}
