import { componentsIn, heightOf, strokesOf, widthOf, type Component } from "./components";
import type { InkImage } from "./raster";
import type { Staff } from "./staves";

export interface StaffHeader {
  readonly contentStart: number;
  readonly fifths: number;
  readonly isTreble: boolean;
}

const SEARCH_SPACES = 16;
const CLEF_MIN_HEIGHT_SPACES = 5.2;
const CLEF_ANY_HEIGHT_SPACES = 2.6;
const ACCIDENTAL_MIN_HEIGHT = 1.8;
const ACCIDENTAL_MAX_HEIGHT = 3.9;
const ACCIDENTAL_MAX_WIDTH = 6;
const DIGIT_MAX_HEIGHT = 2.35;
const DETACHED_BOWL_GAP_SPACES = 0.3;
const JOINED_DIGITS_MIN_WIDTH = 1.2;
const JOINED_DIGITS_MAX_WIDTH = 3;
const TINY_PART_SPACES = 0.9;
const SHARP_PAIR_SPACES = 0.62;
const SHARP_TOP_CLEARANCE_SPACES = 0.25;
const SHARP_TOP_SHARE = 0.3;
const MAX_KEY_MARKS = 7;
const BIGGEST_KEY_GAP_SPACES = 1.2;
const STAFF_MARGIN_SPACES = 3.2;

function isAccidentalShape(part: Component, spacing: number): boolean {
  const height = heightOf(part) / spacing;
  return height >= ACCIDENTAL_MIN_HEIGHT && height <= ACCIDENTAL_MAX_HEIGHT && widthOf(part) / spacing <= ACCIDENTAL_MAX_WIDTH;
}

interface KeyMarks {
  readonly sharps: number;
  readonly flats: number;
}

function hasInkRightOfStrokeUpTop(clean: InkImage, part: Component, strokeX: number, spacing: number): boolean {
  const fromX = Math.round(strokeX + spacing * SHARP_TOP_CLEARANCE_SPACES);
  const bottom = part.top + Math.round(heightOf(part) * SHARP_TOP_SHARE);
  for (let y = part.top; y <= bottom; y += 1) {
    for (let x = fromX; x <= part.right; x += 1) {
      if (clean.ink[y * clean.width + x] === 1) return true;
    }
  }
  return false;
}

function keyMarksOf(ink: InkImage, clean: InkImage, part: Component, spacing: number): KeyMarks {
  const strokes = strokesOf(ink, part, spacing * ACCIDENTAL_MIN_HEIGHT).map((stroke) => stroke.x);
  const first = strokes[0];
  if (first === undefined) return { sharps: 0, flats: 0 };
  const second = strokes[1];
  const isPairedSharp = second !== undefined && second - first <= spacing * SHARP_PAIR_SPACES;
  if (isPairedSharp) return { sharps: Math.max(1, Math.round(strokes.length / 2)), flats: 0 };
  if (strokes.length === 1 && hasInkRightOfStrokeUpTop(clean, part, first, spacing)) return { sharps: 1, flats: 0 };
  return { sharps: 0, flats: strokes.length };
}

function columnMates(part: Component, parts: readonly Component[], spacing: number): Component[] {
  return parts.filter((other) => Math.min(other.right, part.right) - Math.max(other.left, part.left) >= Math.min(spacing * 0.3, widthOf(other) * 0.5));
}

function isTimeSignaturePart(part: Component, parts: readonly Component[], staff: Staff): boolean {
  const s = staff.spacing;
  const mates = columnMates(part, parts, s);
  const top = Math.min(...mates.map((mate) => mate.top));
  const bottom = Math.max(...mates.map((mate) => mate.bottom));
  const left = Math.min(...mates.map((mate) => mate.left));
  const right = Math.max(...mates.map((mate) => mate.right));
  const reachesBoth = Math.abs(top - staff.top) <= s * 0.5 && Math.abs(bottom - staff.bottom) <= s * 0.5;
  const isShort = mates.every((mate) => heightOf(mate) <= s * DIGIT_MAX_HEIGHT);
  const middle = (staff.top + staff.bottom) / 2;
  const hasBothHalves = mates.some((mate) => mate.bottom < middle + s * 0.2) && mates.some((mate) => mate.top > middle - s * 0.2);
  const width = (right - left + 1) / s;
  return reachesBoth && isShort && hasBothHalves && width >= 0.9 && width <= 3;
}

function isJoinedDigits(part: Component, staff: Staff): boolean {
  const s = staff.spacing;
  const reachesBoth = Math.abs(part.top - staff.top) <= s * 0.5 && Math.abs(part.bottom - staff.bottom) <= s * 0.5;
  const width = widthOf(part) / s;
  return reachesBoth && width >= JOINED_DIGITS_MIN_WIDTH && width <= JOINED_DIGITS_MAX_WIDTH;
}

function timeSignatureEnd(part: Component, parts: readonly Component[], spacing: number): number {
  return columnMates(part, parts, spacing).reduce((end, other) => Math.max(end, other.right), part.right);
}

function isCommonTime(glyph: Component, ink: InkImage, staff: Staff): boolean {
  const s = staff.spacing;
  if (strokesOf(ink, glyph, s * ACCIDENTAL_MIN_HEIGHT).length >= 2) return false;
  const middle = (staff.top + staff.bottom) / 2;
  const center = (glyph.top + glyph.bottom) / 2;
  const height = heightOf(glyph) / s;
  const width = widthOf(glyph) / s;
  return Math.abs(center - middle) < s * 0.5 && height >= 1.6 && height <= 3.2 && width >= 1.1 && width <= 2.4;
}

export function readStaffHeader(ink: InkImage, clean: InkImage, staff: Staff, measureStart: number): StaffHeader {
  const s = staff.spacing;
  const box = {
    left: measureStart,
    right: Math.min(staff.right, measureStart + s * SEARCH_SPACES),
    top: staff.top - s * STAFF_MARGIN_SPACES,
    bottom: staff.bottom + s * STAFF_MARGIN_SPACES,
  };
  const parts = componentsIn(clean, box)
    .filter((part) => widthOf(part) > 1 && heightOf(part) > 1)
    .sort((one, other) => one.left - other.left);
  const clefIndex = parts.findIndex((part) => heightOf(part) >= s * CLEF_ANY_HEIGHT_SPACES && widthOf(part) >= s * 1.1);
  const clef = parts[clefIndex];
  if (!clef) return { contentStart: measureStart, fifths: 0, isTreble: true };
  const clefMates = columnMates(clef, parts, s);
  const clefHeight = Math.max(...clefMates.map((mate) => mate.bottom)) - Math.min(...clefMates.map((mate) => mate.top));
  const isTreble = clefHeight >= s * CLEF_MIN_HEIGHT_SPACES;
  let cursor = clef.right;
  const marks: KeyMarks[] = [];
  for (const part of parts.slice(clefIndex + 1)) {
    if (part.left <= clef.right - s * 0.3 && part.right <= clef.right) continue;
    if (heightOf(part) < s * TINY_PART_SPACES) continue;
    if (part.left - cursor > s * BIGGEST_KEY_GAP_SPACES) break;
    if (isTimeSignaturePart(part, parts, staff) || isJoinedDigits(part, staff) || isCommonTime(part, ink, staff)) {
      cursor = timeSignatureEnd(part, parts, s);
      break;
    }
    const isDetachedBowl = marks.length > 0 && heightOf(part) < s * ACCIDENTAL_MIN_HEIGHT && part.left - cursor <= s * DETACHED_BOWL_GAP_SPACES;
    if (isDetachedBowl) {
      cursor = Math.max(cursor, part.right);
      continue;
    }
    if (!isAccidentalShape(part, s)) break;
    const found = keyMarksOf(ink, clean, part, s);
    if (found.sharps + found.flats === 0) break;
    marks.push(found);
    cursor = Math.max(cursor, part.right);
  }
  const contentStart = cursor + s * 0.2;
  const sharps = marks.reduce((sum, mark) => sum + mark.sharps, 0);
  const flats = marks.reduce((sum, mark) => sum + mark.flats, 0);
  const fifths = sharps >= flats ? Math.min(MAX_KEY_MARKS, sharps) : -Math.min(MAX_KEY_MARKS, flats);
  return { contentStart, fifths, isTreble };
}
