import { leveledPage } from "./pageLeveling";
import type { InkImage } from "./raster";
import { readMeasureNotes, withPitches, type ReadNote } from "./readMeasure";
import { withoutStaffLines } from "./staffCleaning";
import { readStaffHeader } from "./staffHeader";
import { findStaves, groupSystems } from "./staves";
import type { ScoreMeasure } from "./structure";

const SINGLE_KEY_MIN_SHARE = 0.6;

export interface ReadMeasure {
  readonly page: number;
  readonly system: number;
  readonly fifths: number;
  readonly isTreble: boolean;
  readonly notes: readonly ReadNote[];
}

export function readPageNotes(source: InkImage, measures: readonly ScoreMeasure[]): ReadMeasure[] {
  const image = leveledPage(source);
  const staves = findStaves(image);
  const systems = groupSystems(image, staves);
  const clean = withoutStaffLines(image, staves);
  return systems.flatMap((system, systemIndex) => {
    const staff = system.staves[0];
    const inSystem = measures.filter((measure) => measure.system === systemIndex);
    const first = inSystem[0];
    if (!staff || !first) return [];
    const header = readStaffHeader(image, clean, staff, first.x0 * image.width);
    return inSystem.map((measure, index) => {
      const from = index === 0 ? header.contentStart : measure.x0 * image.width + staff.spacing * 0.3;
      const to = measure.x1 * image.width - staff.spacing * 0.3;
      return {
        page: measure.page,
        system: systemIndex,
        fifths: header.fifths,
        isTreble: header.isTreble,
        notes: readMeasureNotes(image, clean, staff, from, to),
      };
    });
  });
}

function mostCommon(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [0, 0])[0];
}

export function settleKeys(measures: readonly ReadMeasure[]): ReadMeasure[] {
  const systemKeys: Array<{ page: number; system: number; fifths: number }> = [];
  for (const measure of measures) {
    const last = systemKeys[systemKeys.length - 1];
    if (!last || last.page !== measure.page || last.system !== measure.system) systemKeys.push({ page: measure.page, system: measure.system, fifths: measure.fifths });
  }
  const common = mostCommon(systemKeys.map((entry) => entry.fifths));
  const commonShare = systemKeys.filter((entry) => entry.fifths === common).length / Math.max(1, systemKeys.length);
  const settled = systemKeys.map((entry, index) => {
    const neighbors = [systemKeys[index - 1]?.fifths, systemKeys[index + 1]?.fifths];
    const isLoneMisread = commonShare >= SINGLE_KEY_MIN_SHARE && !neighbors.includes(entry.fifths);
    return { ...entry, fifths: isLoneMisread ? common : entry.fifths };
  });
  return measures.map((measure) => {
    const fifths = settled.find((entry) => entry.page === measure.page && entry.system === measure.system)?.fifths ?? common;
    return { ...measure, fifths, notes: withPitches(measure.notes, fifths) };
  });
}
