import type { ReadNote } from "./readMeasure";
import type { ReadMeasure } from "./readPage";

export interface TimedMeasure extends ReadMeasure {
  readonly quarters: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly isPickup: boolean;
  readonly addsUp: boolean;
}

const KNOWN_METERS = [1.5, 2, 3, 4, 4.5, 6];
const FALLBACK_METER = 4;
const DOTTED_MEASURE_RESTS: readonly number[] = [1.5, 3, 6];
const MIN_CHANGE_RUN = 3;
const SHRINKING_CHANGE_RUN = 8;
const EPSILON = 0.01;
const COMPOUND_MIN_SHARE = 0.3;
const EIGHTH = 0.5;
const TRIPLET_RATIO = 2 / 3;

function sumOf(notes: readonly ReadNote[]): number {
  return notes.reduce((sum, note) => sum + note.quarters, 0);
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

function knownMeterOf(sum: number): number | null {
  return KNOWN_METERS.find((meter) => same(meter, sum)) ?? null;
}

function mostCommonMeter(sums: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const sum of sums) {
    const meter = knownMeterOf(sum);
    if (meter !== null) counts.set(meter, (counts.get(meter) ?? 0) + 1);
  }
  let best = FALLBACK_METER;
  let bestCount = 0;
  for (const [meter, count] of counts) {
    if (count > bestCount) {
      best = meter;
      bestCount = count;
    }
  }
  return best;
}

function isBeamedGroupOfThree(notes: readonly ReadNote[], index: number): boolean {
  const [one, two, three] = [notes[index], notes[index + 1], notes[index + 2]];
  if (!one || !two || !three || one.isRest || two.isRest || three.isRest) return false;
  return one.beamedToNext && two.beamedToNext && !three.beamedToNext && same(one.quarters, two.quarters) && same(two.quarters, three.quarters);
}

export function withTriplets(notes: readonly ReadNote[], target: number): readonly ReadNote[] {
  let excess = sumOf(notes) - target;
  if (excess <= EPSILON) return notes;
  const result = [...notes];
  let index = 0;
  while (index + 2 < result.length && excess > EPSILON) {
    if (!isBeamedGroupOfThree(result, index)) {
      index += 1;
      continue;
    }
    const written = (result[index] as ReadNote).quarters;
    for (let offset = 0; offset < 3; offset += 1) {
      result[index + offset] = { ...(result[index + offset] as ReadNote), quarters: written * TRIPLET_RATIO, triplet: true };
    }
    excess -= written;
    index += 3;
  }
  return same(excess, 0) ? result : notes;
}

function isLoneRest(notes: readonly ReadNote[]): boolean {
  return notes.length === 1 && notes[0]?.isRest === true;
}

function dotsOfMeasureRest(quarters: number): number {
  return DOTTED_MEASURE_RESTS.includes(quarters) ? 1 : 0;
}

function restOf(quarters: number): ReadNote {
  return { x: 0, isRest: true, midi: [], positions: [], writtenAlters: [], quarters, dots: dotsOfMeasureRest(quarters), beamedToNext: false, tiedToNext: false, triplet: false };
}

function meterPerMeasure(sums: readonly number[], common: number): number[] {
  let current = common;
  return sums.map((sum, index) => {
    const meter = knownMeterOf(sum);
    if (meter === null || same(meter, current)) return current;
    const needed = meter <= common / 2 ? SHRINKING_CHANGE_RUN : MIN_CHANGE_RUN;
    const run = sums.slice(index, index + needed);
    if (run.length === needed && run.every((other) => same(other, meter))) current = meter;
    return current;
  });
}

function isCompound(measures: readonly ReadMeasure[]): boolean {
  let grouped = 0;
  let total = 0;
  for (const { notes } of measures) {
    total += notes.length;
    notes.forEach((note, index) => {
      if (isBeamedGroupOfThree(notes, index) && same(note.quarters, EIGHTH)) grouped += 3;
    });
  }
  return total > 0 && grouped / total >= COMPOUND_MIN_SHARE;
}

function signatureOf(meter: number, compound: boolean): { numerator: number; denominator: number } {
  if (same(meter, 1.5)) return { numerator: 3, denominator: 8 };
  if (same(meter, 4.5)) return { numerator: 9, denominator: 8 };
  if (same(meter, 3) && compound) return { numerator: 6, denominator: 8 };
  if (same(meter, 6) && compound) return { numerator: 12, denominator: 8 };
  return { numerator: Math.round(meter), denominator: 4 };
}

function hasPickup(first: number, last: number, meter: number): boolean {
  if (first <= EPSILON || first >= meter - EPSILON) return false;
  return same(first + last, meter) || first <= meter / 2 + EPSILON;
}

export function inferMeter(measures: readonly ReadMeasure[]): TimedMeasure[] {
  const sums = measures.map((measure) => (isLoneRest(measure.notes) ? 0 : sumOf(measure.notes)));
  const common = mostCommonMeter(sums);
  const meters = meterPerMeasure(sums, common);
  const compound = isCompound(measures.filter((_, index) => same(meters[index] ?? common, common)));
  const lastIndex = measures.length - 1;
  const opensWithPickup = lastIndex > 0 && hasPickup(sums[0] ?? 0, sums[lastIndex] ?? 0, meters[0] ?? common);
  return measures.map((measure, index) => {
    const meter = meters[index] ?? common;
    const signature = signatureOf(meter, compound && same(meter, common));
    if (measure.notes.length === 0) return { ...measure, ...signature, notes: [restOf(meter)], quarters: meter, isPickup: false, addsUp: false };
    if (isLoneRest(measure.notes)) return { ...measure, ...signature, notes: [{ ...(measure.notes[0] as ReadNote), quarters: meter, dots: dotsOfMeasureRest(meter) }], quarters: meter, isPickup: false, addsUp: true };
    const notes = withTriplets(measure.notes, meter);
    const sum = sumOf(notes);
    const isPickup = index === 0 && opensWithPickup;
    const closesPickup = index === lastIndex && opensWithPickup && same((sums[0] ?? 0) + sum, meter);
    const addsUp = same(sum, meter) || isPickup || closesPickup;
    return { ...measure, ...signature, notes, quarters: addsUp ? sum : meter, isPickup, addsUp };
  });
}
