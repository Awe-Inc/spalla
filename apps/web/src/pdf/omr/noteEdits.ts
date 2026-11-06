import type { TimedMeasure } from "./meter";
import type { ReadNote } from "./readMeasure";

const EPSILON = 0.01;
const DOTTED = new Set([0.75, 1.5, 3, 6]);

export const EDITABLE_QUARTERS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

function withNotes(measure: TimedMeasure, notes: readonly ReadNote[], meterQuarters: number): TimedMeasure {
  const sum = notes.reduce((total, note) => total + note.quarters, 0);
  const addsUp = Math.abs(sum - meterQuarters) < EPSILON || (measure.isPickup && sum > 0 && sum < meterQuarters);
  return { ...measure, notes, addsUp, quarters: addsUp ? sum : meterQuarters };
}

function meterQuartersOf(measure: Pick<TimedMeasure, "numerator" | "denominator">): number {
  return (measure.numerator * 4) / measure.denominator;
}

function replacing(measure: TimedMeasure, index: number, change: (note: ReadNote) => ReadNote): TimedMeasure {
  const notes = measure.notes.map((note, position) => (position === index ? change(note) : note));
  return withNotes(measure, notes, meterQuartersOf(measure));
}

export function shiftedPitch(measure: TimedMeasure, index: number, semitones: number): TimedMeasure {
  return replacing(measure, index, (note) => ({ ...note, midi: note.midi.map((midi) => midi + semitones) }));
}

export function withDuration(measure: TimedMeasure, index: number, quarters: number): TimedMeasure {
  return replacing(measure, index, (note) => ({ ...note, quarters, dots: DOTTED.has(quarters) ? 1 : 0, triplet: false }));
}

export function withoutNote(measure: TimedMeasure, index: number): TimedMeasure {
  return withNotes(measure, measure.notes.filter((_, position) => position !== index), meterQuartersOf(measure));
}

export function measuresToReview(measures: readonly TimedMeasure[]): number[] {
  return measures.flatMap((measure, index) => (measure.addsUp ? [] : [index]));
}
