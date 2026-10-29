import type { Score } from "@fretless/core";

import { durationQuarters } from "./staffLayout";

export const PAGE_SPACING_PX = 10;
const SYSTEM_HEIGHT_SPACES = 10;
const STAFF_TOP_SPACES = 3.5;
const PAGE_MARGIN_SPACES = 2;
const NOTE_UNIT_SPACES = 2.6;
const MEASURE_PADDING_SPACES = 1.4;
const CLEF_SPACES = 3.4;
const KEY_ACCIDENTAL_SPACES = 1;
const TIME_SIGNATURE_SPACES = 2.4;
const HEADER_GAP_SPACES = 0.8;
const SHORT_LAST_SYSTEM = 0.7;

export interface NoteAnchor {
  seconds: number;
  x: number;
}

export interface PageSystem {
  index: number;
  firstMeasure: number;
  lastMeasure: number;
  firstEvent: number;
  lastEvent: number;
  staffTop: number;
  left: number;
  right: number;
  barXs: number[];
  anchors: NoteAnchor[];
  startSeconds: number;
  endSeconds: number;
  showsTimeSignature: boolean;
}

export interface PageLayout {
  spacing: number;
  systemHeight: number;
  systemsPerPage: number;
  pageCount: number;
  systems: PageSystem[];
}

function noteWeight(quarters: number): number {
  return 1 + Math.log2(1 + Math.max(0, quarters));
}

function eventsByMeasure(score: Score): number[][] {
  const groups = score.measures.map((): number[] => []);
  score.events.forEach((event, index) => {
    groups[event.measureIndex]?.push(index);
  });
  return groups;
}

export function headerWidth(score: Score, spacing: number, showsTimeSignature: boolean): number {
  const accidentals = Math.min(7, Math.abs(Math.trunc(score.keyFifths)));
  const spaces = CLEF_SPACES + accidentals * KEY_ACCIDENTAL_SPACES + (showsTimeSignature ? TIME_SIGNATURE_SPACES : 0) + HEADER_GAP_SPACES;
  return spaces * spacing;
}

function breakIntoLines(widths: number[], availableFor: (lineIndex: number) => number): number[][] {
  const lines: number[][] = [];
  let current: number[] = [];
  let used = 0;
  widths.forEach((width, measure) => {
    const available = availableFor(lines.length);
    if (current.length > 0 && used + width > available) {
      lines.push(current);
      current = [];
      used = 0;
    }
    current.push(measure);
    used += width;
  });
  if (current.length > 0) lines.push(current);
  return lines;
}

export function buildPageLayout(score: Score, width: number, height: number, scale = 1): PageLayout {
  const spacing = PAGE_SPACING_PX * scale;
  const systemHeight = spacing * SYSTEM_HEIGHT_SPACES;
  const systemsPerPage = Math.max(1, Math.floor(height / systemHeight));
  const left = spacing * PAGE_MARGIN_SPACES;
  const right = Math.max(left + spacing, width - spacing * PAGE_MARGIN_SPACES);
  const padding = spacing * MEASURE_PADDING_SPACES;
  const unit = spacing * NOTE_UNIT_SPACES;
  const groups = eventsByMeasure(score);
  const weights = groups.map((indices) => indices.map((index) => noteWeight(durationQuarters(score, index))));
  const naturalWidths = weights.map((list) => padding * 2 + Math.max(1, list.reduce((sum, w) => sum + w, 0)) * unit);
  const availableFor = (lineIndex: number) => right - left - headerWidth(score, spacing, lineIndex === 0);
  const lines = breakIntoLines(naturalWidths, availableFor);

  const systems = lines.map((measures, lineIndex): PageSystem => {
    const showsTimeSignature = lineIndex === 0;
    const contentLeft = left + headerWidth(score, spacing, showsTimeSignature);
    const available = right - contentLeft;
    const natural = measures.reduce((sum, m) => sum + (naturalWidths[m] ?? 0), 0);
    const isLast = lineIndex === lines.length - 1;
    const stretch = isLast && natural < available * SHORT_LAST_SYSTEM ? 1 : available / natural;
    const barXs: number[] = [contentLeft];
    const anchors: NoteAnchor[] = [];
    let x = contentLeft;
    for (const m of measures) {
      const measureWidth = (naturalWidths[m] ?? 0) * stretch;
      const noteUnit = (measureWidth - padding * 2) / Math.max(1, (weights[m] ?? []).reduce((sum, w) => sum + w, 0));
      let cursor = x + padding;
      (groups[m] ?? []).forEach((eventIndex, offset) => {
        const event = score.events[eventIndex];
        if (event) anchors.push({ seconds: event.startSeconds, x: cursor });
        cursor += (weights[m]?.[offset] ?? 1) * noteUnit;
      });
      x += measureWidth;
      barXs.push(x);
    }
    const firstMeasure = measures[0] ?? 0;
    const lastMeasure = measures[measures.length - 1] ?? 0;
    const eventIndices = measures.flatMap((m) => groups[m] ?? []);
    const endSeconds = score.measures[lastMeasure]?.endSeconds ?? 0;
    anchors.push({ seconds: endSeconds, x: x - padding * 0.5 });
    return {
      index: lineIndex,
      firstMeasure,
      lastMeasure,
      firstEvent: eventIndices[0] ?? -1,
      lastEvent: eventIndices[eventIndices.length - 1] ?? -1,
      staffTop: (lineIndex % systemsPerPage) * systemHeight + spacing * STAFF_TOP_SPACES,
      left,
      right,
      barXs,
      anchors,
      startSeconds: score.measures[firstMeasure]?.startSeconds ?? 0,
      endSeconds,
      showsTimeSignature,
    };
  });

  return { spacing, systemHeight, systemsPerPage, pageCount: Math.max(1, Math.ceil(systems.length / systemsPerPage)), systems };
}

export function xAtSystem(system: PageSystem, seconds: number): number {
  const { anchors } = system;
  const first = anchors[0];
  if (!first || seconds <= first.seconds) return first?.x ?? system.barXs[0] ?? system.left;
  for (let i = 1; i < anchors.length; i += 1) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (!a || !b || seconds > b.seconds) continue;
    const span = b.seconds - a.seconds;
    return span <= 0 ? b.x : a.x + ((seconds - a.seconds) / span) * (b.x - a.x);
  }
  return anchors[anchors.length - 1]?.x ?? first.x;
}

export function systemIndexAt(layout: PageLayout, seconds: number): number {
  let found = 0;
  layout.systems.forEach((system, index) => {
    if (system.startSeconds <= seconds) found = index;
  });
  return found;
}

export function pageOfSystem(layout: PageLayout, systemIndex: number): number {
  return Math.floor(systemIndex / layout.systemsPerPage);
}

export function systemsOnPage(layout: PageLayout, page: number): PageSystem[] {
  const start = page * layout.systemsPerPage;
  return layout.systems.slice(start, start + layout.systemsPerPage);
}

export function measureIndexAt(score: Score, seconds: number): number {
  let found = -1;
  score.measures.forEach((measure, index) => {
    if (measure.startSeconds <= seconds && seconds < measure.endSeconds) found = index;
  });
  return found;
}

export interface HeaderOffsets {
  clef: number;
  key: number;
  time: number;
}

export function headerOffsets(score: Score, spacing: number): HeaderOffsets {
  const accidentals = Math.min(7, Math.abs(Math.trunc(score.keyFifths)));
  return { clef: spacing * 0.3, key: spacing * CLEF_SPACES, time: spacing * (CLEF_SPACES + accidentals * KEY_ACCIDENTAL_SPACES) };
}
