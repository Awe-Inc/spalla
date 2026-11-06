import type { ScoreMeasure } from "./structure";

const LOOP_GUARD_FACTOR = 16;

function firstIndexWith(measures: readonly ScoreMeasure[], test: (measure: ScoreMeasure) => boolean, from = 0): number {
  for (let index = from; index < measures.length; index += 1) {
    const measure = measures[index];
    if (measure && test(measure)) return index;
  }
  return -1;
}

function finalVoltaNumbers(measures: readonly ScoreMeasure[]): ReadonlySet<number> {
  const finals = new Set<number>();
  let start = 0;
  while (start < measures.length) {
    if (!measures[start]?.endings?.length) {
      start += 1;
      continue;
    }
    let end = start;
    let highest = 0;
    while (end < measures.length && measures[end]?.endings?.length) {
      for (const number of measures[end]?.endings ?? []) highest = Math.max(highest, number);
      end += 1;
    }
    for (let index = start; index < end; index += 1) {
      if (measures[index]?.endings?.includes(highest)) finals.add(index);
    }
    start = end;
  }
  return finals;
}

function endsVoltaBlock(measures: readonly ScoreMeasure[], index: number): boolean {
  const measure = measures[index];
  const next = measures[index + 1];
  return Boolean(measure?.endings?.length) && !next?.endings?.length;
}

export function performancePath(measures: readonly ScoreMeasure[]): number[] {
  const finals = finalVoltaNumbers(measures);
  const limit = measures.length * LOOP_GUARD_FACTOR + LOOP_GUARD_FACTOR;
  const order: number[] = [];
  let index = 0;
  let repeatStart = 0;
  let pass = 1;
  let jumped = false;

  while (index < measures.length && order.length < limit) {
    const measure = measures[index] as ScoreMeasure;
    if (measure.repeatStart && !jumped && index !== repeatStart) {
      repeatStart = index;
      pass = 1;
    }
    if (measure.endings?.length) {
      const taken = jumped ? finals.has(index) : measure.endings.includes(pass);
      if (!taken) {
        index += 1;
        continue;
      }
    }
    order.push(index);

    if (jumped && measure.fine) break;
    if (jumped && measure.toCoda) {
      const coda = firstIndexWith(measures, (candidate) => Boolean(candidate.coda), index + 1);
      if (coda >= 0) {
        index = coda;
        continue;
      }
    }
    if (measure.repeatEnd && !jumped) {
      if (pass < 2) {
        pass += 1;
        index = repeatStart;
        continue;
      }
      pass = 1;
      repeatStart = index + 1;
    } else if (endsVoltaBlock(measures, index) && !jumped) {
      pass = 1;
      repeatStart = index + 1;
    }
    if (!jumped && measure.daCapo) {
      jumped = true;
      index = 0;
      continue;
    }
    if (!jumped && measure.dalSegno) {
      const segno = firstIndexWith(measures, (candidate) => Boolean(candidate.segno));
      if (segno >= 0) {
        jumped = true;
        index = segno;
        continue;
      }
    }
    index += 1;
  }
  return order;
}
