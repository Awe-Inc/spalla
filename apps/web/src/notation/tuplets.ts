import type { Score } from "@fretless/core";

import {
  type BeamLine,
  beamThickness,
  beamYAt,
  durationQuarters,
  hasStem,
  MIDDLE_LINE_POSITION,
  noteX,
  positionY,
  type StaffGeometry,
  staffPosition,
  stemLength,
  stemX,
} from "./staffLayout";

export interface TupletSpan {
  first: number;
  last: number;
  label: string;
}

export interface TupletMark {
  label: string;
  x0: number;
  x1: number;
  y: number;
  above: boolean;
  bracket: boolean;
}

const TRIPLET_SHIFT = Math.log2(1.5);
const LOG_TOLERANCE = 0.04;
const SPAN_TOLERANCE = 0.02;
const TUPLET_SPANS_QUARTERS = [1, 2, 4];
const LONGEST_SPAN_QUARTERS = 4;
const EVEN_LABELS = new Set([3, 6]);

function nearPowerOfTwo(value: number): boolean {
  const log = Math.log2(value);
  return Math.abs(log - Math.round(log)) < LOG_TOLERANCE;
}

export function isTripletValue(quarters: number): boolean {
  if (quarters <= 0) return false;
  const log = Math.log2(quarters);
  if (nearPowerOfTwo(quarters) || Math.abs(log - TRIPLET_SHIFT - Math.round(log - TRIPLET_SHIFT)) < LOG_TOLERANCE) return false;
  return nearPowerOfTwo(quarters * 1.5);
}

function closesSpan(sum: number): boolean {
  return TUPLET_SPANS_QUARTERS.some((span) => Math.abs(sum - span) < SPAN_TOLERANCE);
}

function labelFor(lengths: number[]): string {
  const [firstLength] = lengths;
  const even = firstLength !== undefined && lengths.every((length) => Math.abs(length - firstLength) < SPAN_TOLERANCE);
  return even && EVEN_LABELS.has(lengths.length) ? String(lengths.length) : "3";
}

function spanFrom(score: Score, start: number): { span: TupletSpan | null; next: number } {
  const { events } = score;
  const lengths: number[] = [];
  let sum = 0;
  let last = start;
  let at = start;
  while (at < events.length) {
    if (events[at]?.isGrace) {
      at += 1;
      continue;
    }
    const quarters = durationQuarters(score, at);
    if (!isTripletValue(quarters)) break;
    lengths.push(quarters);
    sum += quarters;
    last = at;
    at += 1;
    if (closesSpan(sum)) return { span: { first: start, last, label: labelFor(lengths) }, next: at };
    if (sum > LONGEST_SPAN_QUARTERS) break;
  }
  return { span: null, next: Math.max(at, start + 1) };
}

const spansByScore = new WeakMap<Score, TupletSpan[]>();

export function findTuplets(score: Score): TupletSpan[] {
  const cached = spansByScore.get(score);
  if (cached) return cached;
  const spans: TupletSpan[] = [];
  let at = 0;
  while (at < score.events.length) {
    const event = score.events[at];
    if (!event || event.isGrace || !isTripletValue(durationQuarters(score, at))) {
      at += 1;
      continue;
    }
    const { span, next } = spanFrom(score, at);
    if (span) spans.push(span);
    at = next;
  }
  spansByScore.set(score, spans);
  return spans;
}

function spanIndices(score: Score, span: TupletSpan): number[] {
  const indices: number[] = [];
  for (let at = span.first; at <= span.last; at += 1) if (score.events[at] && !score.events[at]?.isGrace) indices.push(at);
  return indices;
}

function bracketedMark(score: Score, span: TupletSpan, geometry: StaffGeometry): TupletMark {
  const indices = spanIndices(score, span);
  const notes = indices.map((at) => score.events[at]).filter((event) => event !== undefined);
  const pitched = indices.filter((at) => !score.events[at]?.isRest);
  const positions = pitched.map((at) => staffPosition(score.events[at]?.noteName ?? ""));
  const above = positions.length === 0 || positions.reduce((sum, position) => sum + position, 0) < MIDDLE_LINE_POSITION * positions.length;
  const reach = pitched.map((at, offset) => {
    const headY = positionY(geometry, positions[offset] ?? MIDDLE_LINE_POSITION);
    const stem = hasStem(durationQuarters(score, at)) ? stemLength(geometry) : 0;
    return above ? headY - stem : headY + stem;
  });
  const margin = geometry.spacing * 0.9;
  const y = above ? Math.min(geometry.staffTop, ...reach) - margin : Math.max(geometry.bottomY, ...reach) + margin;
  const first = notes[0];
  const last = notes[notes.length - 1];
  const halfHead = geometry.headWidth * 0.6;
  return {
    label: span.label,
    x0: noteX(geometry, first?.startSeconds ?? 0) - halfHead,
    x1: noteX(geometry, last?.startSeconds ?? 0) + halfHead,
    y,
    above,
    bracket: true,
  };
}

export function layoutTuplet(score: Score, span: TupletSpan, geometry: StaffGeometry, beam: BeamLine | null): TupletMark {
  if (!beam) return bracketedMark(score, span, geometry);
  const first = score.events[span.first];
  const last = score.events[span.last];
  const x0 = stemX(geometry, first?.startSeconds ?? 0, beam.stemUp);
  const x1 = stemX(geometry, last?.startSeconds ?? 0, beam.stemUp);
  const outward = beam.stemUp ? -1 : 1;
  const middle = (x0 + x1) / 2;
  const clearance = beamThickness(geometry) / 2 + geometry.spacing * 0.9;
  return { label: span.label, x0, x1, y: beamYAt(beam, middle) + outward * clearance, above: beam.stemUp, bracket: false };
}
