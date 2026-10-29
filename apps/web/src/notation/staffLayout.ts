import type { BeamGroup, Grade, NoteJudgement, Score, ScoreEvent } from "@fretless/core";

export const CURSOR_FRACTION = 0.2;
export const SECONDS_VISIBLE = 6;
export const MIDDLE_LINE_POSITION = 4;
export const STAFF_LINES = 5;

const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const BOTTOM_LINE_LADDER = 4 * 7 + 2;
const SHARP_POSITIONS = [8, 5, 9, 6, 3, 7, 4];
const FLAT_POSITIONS = [4, 7, 3, 6, 2, 5, 1];
const SHORTEST_UNBEAMED_QUARTERS = 0.9;
const MAX_BEAMS = 4;
const HOLLOW_HEAD_QUARTERS = 1.75;
const STEMLESS_QUARTERS = 3.5;
const DOT_SHIFT = Math.log2(1.5);

export type NoteTone = "upcoming" | "current" | "unjudged" | Grade;

export interface StaffGeometry {
  width: number;
  height: number;
  spacing: number;
  staffTop: number;
  bottomY: number;
  cursorX: number;
  pixelsPerSecond: number;
  headWidth: number;
  headHeight: number;
  songTime: number;
  xAt?: (startSeconds: number) => number;
}

export type TimeAxis = Pick<StaffGeometry, "cursorX" | "pixelsPerSecond" | "songTime" | "xAt">;

export interface BeamLine {
  stemUp: boolean;
  levels: number;
  x0: number;
  y0: number;
  slope: number;
}

export function staffPosition(noteName: string): number {
  const index = LETTER_INDEX[noteName.charAt(0)];
  if (index === undefined) return 0;
  const octave = Number.parseInt(noteName.replace(/^[A-G][#b]*/, ""), 10);
  if (Number.isNaN(octave)) return 0;
  return octave * 7 + index - BOTTOM_LINE_LADDER;
}

export function accidentalOf(noteName: string): "#" | "b" | null {
  const mark = noteName.charAt(1);
  return mark === "#" || mark === "b" ? mark : null;
}

export function keySignaturePositions(fifths: number): number[] {
  const clamped = Math.max(-7, Math.min(7, Math.trunc(fifths)));
  const table = clamped > 0 ? SHARP_POSITIONS : FLAT_POSITIONS;
  return table.slice(0, Math.abs(clamped));
}

function quartersPerSecond(events: ScoreEvent[], from: number, to: number): number {
  const a = events[from];
  const b = events[to];
  if (!a || !b) return 0;
  const seconds = b.startSeconds - a.startSeconds;
  if (seconds <= 0) return 0;
  return (b.startQuarters - a.startQuarters) / seconds;
}

export function durationQuarters(score: Score, index: number): number {
  const { events } = score;
  const event = events[index];
  if (!event) return 0;
  let rate = index + 1 < events.length ? quartersPerSecond(events, index, index + 1) : 0;
  if (rate <= 0 && index > 0) rate = quartersPerSecond(events, index - 1, index);
  if (rate <= 0) rate = score.beatsPerMinute / 60;
  return event.durationSeconds * rate;
}

export function beamCount(quarters: number): number {
  if (quarters <= 0 || quarters >= SHORTEST_UNBEAMED_QUARTERS) return 0;
  const logLength = -Math.log2(quarters);
  const readings = [logLength, logLength + DOT_SHIFT, logLength - DOT_SHIFT];
  let bestDistance = 1;
  let beams = 1;
  for (const reading of readings) {
    const nearest = Math.round(reading);
    const distance = Math.abs(reading - nearest);
    if (distance < bestDistance) {
      bestDistance = distance;
      beams = nearest;
    }
  }
  return Math.max(1, Math.min(MAX_BEAMS, beams));
}

export function isHollowHead(quarters: number): boolean {
  return quarters >= HOLLOW_HEAD_QUARTERS;
}

export function hasStem(quarters: number): boolean {
  return quarters < STEMLESS_QUARTERS;
}

export function stemUpFor(position: number): boolean {
  return position < MIDDLE_LINE_POSITION;
}

export function ledgerLinePositions(position: number): number[] {
  const lines: number[] = [];
  for (let p = 10; p <= position; p += 2) lines.push(p);
  for (let p = -2; p >= position; p -= 2) lines.push(p);
  return lines;
}

export function buildGeometry(width: number, height: number, songTime: number): StaffGeometry {
  const spacing = Math.max(9, Math.min(18, height / 10));
  const staffTop = height / 2 - spacing * 2;
  const bottomY = staffTop + spacing * 4;
  const cursorX = width * CURSOR_FRACTION;
  const pixelsPerSecond = (width - cursorX) / SECONDS_VISIBLE;
  const headHeight = spacing * 0.92;
  return { width, height, spacing, staffTop, bottomY, cursorX, pixelsPerSecond, headWidth: headHeight * 1.32, headHeight, songTime };
}

export function noteX(geometry: TimeAxis, startSeconds: number): number {
  if (geometry.xAt) return geometry.xAt(startSeconds);
  return geometry.cursorX + (startSeconds - geometry.songTime) * geometry.pixelsPerSecond;
}

export function positionY(geometry: StaffGeometry, position: number): number {
  return geometry.bottomY - position * geometry.spacing * 0.5;
}

export function stemX(geometry: StaffGeometry, startSeconds: number, stemUp: boolean): number {
  return noteX(geometry, startSeconds) + (stemUp ? geometry.headWidth * 0.44 : -geometry.headWidth * 0.44);
}

export function stemLength(geometry: StaffGeometry): number {
  return geometry.spacing * 3.3;
}

export function beamThickness(geometry: StaffGeometry): number {
  return geometry.spacing * 0.42;
}

export function beamGap(geometry: StaffGeometry): number {
  return geometry.spacing * 0.72;
}

export function visibleWindow(geometry: TimeAxis): { start: number; end: number } {
  return {
    start: geometry.songTime - geometry.cursorX / geometry.pixelsPerSecond - 0.5,
    end: geometry.songTime + SECONDS_VISIBLE + 0.5,
  };
}

export function visibleEventIndices(score: Score, geometry: TimeAxis): number[] {
  const { start, end } = visibleWindow(geometry);
  const indices: number[] = [];
  score.events.forEach((event, index) => {
    if (event.startSeconds + event.durationSeconds >= start && event.startSeconds <= end) indices.push(index);
  });
  return indices;
}

export function barlineTimes(score: Score, geometry: TimeAxis): number[] {
  const { start, end } = visibleWindow(geometry);
  return score.measures.map((measure) => measure.startSeconds).filter((time) => time >= start && time <= end);
}

export function beamGroupOf(groups: BeamGroup[], index: number): BeamGroup | null {
  return groups.find((group) => index >= group.first && index <= group.last) ?? null;
}

export function layoutBeam(score: Score, group: BeamGroup, geometry: StaffGeometry): BeamLine {
  const events = score.events.slice(group.first, group.last + 1);
  const first = events[0];
  const last = events[events.length - 1];
  if (!first || !last) return { stemUp: true, levels: 1, x0: 0, y0: 0, slope: 0 };
  let positionSum = 0;
  let levels = 1;
  events.forEach((item, offset) => {
    positionSum += staffPosition(item.noteName);
    levels = Math.max(levels, beamCount(durationQuarters(score, group.first + offset)));
  });
  const stemUp = positionSum < MIDDLE_LINE_POSITION * events.length;
  const direction = stemUp ? -1 : 1;
  const x0 = stemX(geometry, first.startSeconds, stemUp);
  let y0 = positionY(geometry, staffPosition(first.noteName)) + direction * stemLength(geometry);
  const x1 = stemX(geometry, last.startSeconds, stemUp);
  let slope = 0;
  if (x1 > x0) {
    const idealRise = positionY(geometry, staffPosition(last.noteName)) - positionY(geometry, staffPosition(first.noteName));
    const rise = Math.max(-geometry.spacing, Math.min(geometry.spacing, idealRise));
    slope = rise / (x1 - x0);
  }
  const shortestStem = geometry.spacing * 2.5 + (levels - 1) * beamGap(geometry);
  let shift = 0;
  for (const item of events) {
    const sx = stemX(geometry, item.startSeconds, stemUp);
    const tip = y0 + slope * (sx - x0);
    const reach = (positionY(geometry, staffPosition(item.noteName)) - tip) * -direction;
    shift = Math.max(shift, shortestStem - reach);
  }
  y0 += direction * shift;
  return { stemUp, levels, x0, y0, slope };
}

export function beamYAt(beam: BeamLine, x: number): number {
  return beam.y0 + beam.slope * (x - beam.x0);
}

export function toneFor(index: number, currentNoteIndex: number, judgements: NoteJudgement[]): NoteTone {
  if (index === currentNoteIndex) return "current";
  if (index > currentNoteIndex) return "upcoming";
  const judgement = judgements.find((item) => item.eventIndex === index);
  return judgement ? judgement.grade : "unjudged";
}

export interface SlurSpan {
  firstIndex: number;
  lastIndex: number;
}

export function slurSpans(score: Score, indices: number[]): SlurSpan[] {
  const spans: SlurSpan[] = [];
  for (const index of indices) {
    const first = score.events[index];
    if (!first || first.bowSpan <= 1 || first.bowSlot !== 0) continue;
    const lastIndex = index + first.bowSpan - 1;
    const last = score.events[lastIndex];
    if (!last || last.bowSpan !== first.bowSpan || last.bowSlot !== first.bowSpan - 1) continue;
    spans.push({ firstIndex: index, lastIndex });
  }
  return spans;
}

export type RestKind = "whole" | "half" | "quarter" | "eighth" | "sixteenth";

export interface RestShape {
  kind: RestKind;
  dotted: boolean;
}

const REST_KINDS: readonly { kind: RestKind; quarters: number }[] = [
  { kind: "whole", quarters: 4 },
  { kind: "half", quarters: 2 },
  { kind: "quarter", quarters: 1 },
  { kind: "eighth", quarters: 0.5 },
  { kind: "sixteenth", quarters: 0.25 },
];
const DURATION_TOLERANCE = 0.02;

export function restShape(quarters: number, measureQuarters: number): RestShape {
  if (measureQuarters > 0 && Math.abs(quarters - measureQuarters) < DURATION_TOLERANCE) return { kind: "whole", dotted: false };
  for (const { kind, quarters: base } of REST_KINDS) {
    if (Math.abs(quarters - base * 1.5) < DURATION_TOLERANCE) return { kind, dotted: true };
    if (quarters >= base - DURATION_TOLERANCE) return { kind, dotted: false };
  }
  return { kind: "sixteenth", dotted: false };
}
