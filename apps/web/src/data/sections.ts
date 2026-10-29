import type { MeasureRange } from "@fretless/core";

import { db, type StoredSection } from "./db";

export const PHRASE_MEASURES = 4;
export const SHORTEST_PHRASE_MEASURES = 2;
export const FIRST_MEASURE_PARAM = "de";
export const LAST_MEASURE_PARAM = "ate";
export const BPM_PARAM = "bpm";

const TOCAR_PREFIX = "/tocar/";
const DETAIL_PREFIX = "/repertorio/peca/";

export function phraseSections(measureCount: number, size = PHRASE_MEASURES): MeasureRange[] {
  const sections: MeasureRange[] = [];
  for (let first = 0; first < measureCount; first += size) {
    sections.push({ firstIndex: first, lastIndex: Math.min(first + size, measureCount) - 1 });
  }
  const tail = sections.at(-1);
  const beforeTail = sections.at(-2);
  if (tail && beforeTail && tail.lastIndex - tail.firstIndex + 1 < SHORTEST_PHRASE_MEASURES) {
    return [...sections.slice(0, -2), { firstIndex: beforeTail.firstIndex, lastIndex: tail.lastIndex }];
  }
  return sections;
}

export function sectionLabel(range: MeasureRange): string {
  if (range.firstIndex === range.lastIndex) return `Compasso ${range.firstIndex + 1}`;
  return `Compassos ${range.firstIndex + 1}–${range.lastIndex + 1}`;
}

export function detailPath(playTo: string): string {
  return playTo.startsWith(TOCAR_PREFIX) ? `${DETAIL_PREFIX}${playTo.slice(TOCAR_PREFIX.length)}` : playTo;
}

export function practicePath(playTo: string, bpm: number, range: MeasureRange | null = null): string {
  const params = new URLSearchParams();
  if (range) {
    params.set(FIRST_MEASURE_PARAM, String(range.firstIndex + 1));
    params.set(LAST_MEASURE_PARAM, String(range.lastIndex + 1));
  }
  params.set(BPM_PARAM, String(bpm));
  return `${playTo}?${params.toString()}`;
}

export interface PracticeRequest {
  range: MeasureRange | null;
  bpm: number | null;
}

function positiveInteger(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function readPracticeRequest(params: URLSearchParams, measureCount: number): PracticeRequest {
  const first = positiveInteger(params.get(FIRST_MEASURE_PARAM));
  const last = positiveInteger(params.get(LAST_MEASURE_PARAM));
  const isValidRange = first !== null && last !== null && first <= last && last <= measureCount && measureCount > 1;
  return {
    range: isValidRange ? { firstIndex: first - 1, lastIndex: last - 1 } : null,
    bpm: positiveInteger(params.get(BPM_PARAM)),
  };
}

export function sortedSections(sections: readonly StoredSection[]): StoredSection[] {
  return [...sections].sort((a, b) => a.firstIndex - b.firstIndex || a.lastIndex - b.lastIndex);
}

export async function addSection(pieceKey: string, range: MeasureRange, bpm: number, now = Date.now()): Promise<void> {
  await db.pieceSections.add({ pieceKey, firstIndex: range.firstIndex, lastIndex: range.lastIndex, bpm, createdAt: now });
}

export async function removeSection(id: number): Promise<void> {
  await db.pieceSections.delete(id);
}
