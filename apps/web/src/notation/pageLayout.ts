import type { Score } from "@fretless/core";

import { scrollForReading, readingAnchor } from "./readingScroll";
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
const STAFF_LINES_SPACES = 4;
const SCROLL_SMOOTHING_SECONDS = 1.5;

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
  contentHeight: number;
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

export function buildPageLayout(score: Score, width: number, scale = 1): PageLayout {
  const spacing = PAGE_SPACING_PX * scale;
  const systemHeight = spacing * SYSTEM_HEIGHT_SPACES;
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
      staffTop: lineIndex * systemHeight + spacing * STAFF_TOP_SPACES,
      left,
      right,
      barXs,
      anchors,
      startSeconds: score.measures[firstMeasure]?.startSeconds ?? 0,
      endSeconds,
      showsTimeSignature,
    };
  });

  return { spacing, systemHeight, contentHeight: systems.length * systemHeight, systems };
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

export function readingYAt(layout: PageLayout, seconds: number): number {
  const index = systemIndexAt(layout, seconds);
  const system = layout.systems[index];
  if (!system) return 0;
  const span = system.endSeconds - system.startSeconds;
  const progress = span > 0 ? (seconds - system.startSeconds) / span : 0;
  return (index + Math.min(1, Math.max(0, progress))) * layout.systemHeight;
}

function keepsStaffVisibleAnchor(layout: PageLayout, viewHeight: number): number {
  const { spacing, systemHeight } = layout;
  const staffStart = spacing * STAFF_TOP_SPACES;
  const staffEnd = staffStart + spacing * STAFF_LINES_SPACES;
  const anchor = Math.max(readingAnchor(viewHeight), systemHeight - staffStart);
  return Math.max(0, Math.min(anchor, viewHeight - staffEnd));
}

export function pageScrollAt(layout: PageLayout, seconds: number, viewHeight: number): number {
  const readingY = (readingYAt(layout, seconds - SCROLL_SMOOTHING_SECONDS) + readingYAt(layout, seconds) + readingYAt(layout, seconds + SCROLL_SMOOTHING_SECONDS)) / 3;
  return scrollForReading(readingY, viewHeight, layout.contentHeight, keepsStaffVisibleAnchor(layout, viewHeight));
}

export function systemsInView(layout: PageLayout, scrollTop: number, viewHeight: number): PageSystem[] {
  const first = Math.floor(scrollTop / layout.systemHeight);
  const last = Math.ceil((scrollTop + viewHeight) / layout.systemHeight);
  return layout.systems.slice(Math.max(0, first), Math.max(0, last));
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
