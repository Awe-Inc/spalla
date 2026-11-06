import { componentsIn, fillOf, heightOf, strokesOf, widthOf, type Component } from "./components";
import { beamsOnStem, findNoteHeads, hasFlag, type NoteHead } from "./noteHeads";
import type { InkImage } from "./raster";
import type { Staff } from "./staves";

export interface ReadNote {
  readonly x: number;
  readonly isRest: boolean;
  readonly midi: readonly number[];
  readonly positions: readonly number[];
  readonly writtenAlters: ReadonlyArray<number | null>;
  readonly quarters: number;
  readonly dots: number;
  readonly beamedToNext: boolean;
  readonly tiedToNext: boolean;
  readonly triplet: boolean;
}

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const NATURAL_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const E4_DIATONIC = 4 * 7 + 2;
const CHORD_X_SPACES = 0.45;
const MIN_STEMLESS_HEADS = 3;
const SIXTEENTH_REST_MIN_WIDTH = 1.2;
const REST_MAX_STROKE_SPACES = 2.05;

export function alterFromKey(step: number, fifths: number): number {
  const count = Math.abs(fifths);
  const order = fifths >= 0 ? SHARP_ORDER : [...SHARP_ORDER].reverse();
  return order.slice(0, count).includes(step) ? (fifths >= 0 ? 1 : -1) : 0;
}

export function stepOfPosition(position: number): { step: number; octave: number } {
  const diatonic = E4_DIATONIC + position;
  return { step: ((diatonic % 7) + 7) % 7, octave: Math.floor(diatonic / 7) };
}

export function midiOf(position: number, alter: number): number {
  const { step, octave } = stepOfPosition(position);
  return (octave + 1) * 12 + (NATURAL_SEMITONES[step] ?? 0) + alter;
}

function isInk(image: InkImage, x: number, y: number): boolean {
  const px = Math.round(x);
  const py = Math.round(y);
  return px >= 0 && py >= 0 && px < image.width && py < image.height && image.ink[py * image.width + px] === 1;
}

function dotsBeside(clean: InkImage, head: NoteHead, staff: Staff): number {
  const s = staff.spacing;
  const onLine = head.position % 2 === 0;
  const y = onLine ? head.y - s / 2 : head.y;
  const halfWidth = head.kind === "whole" ? s * 0.76 : s * 0.58;
  return countDots(clean, head.x + halfWidth + s * 0.05, y, s);
}

function countDots(clean: InkImage, fromX: number, y: number, s: number): number {
  const box = { left: fromX, right: fromX + s * 1.45, top: y - s * 0.4, bottom: y + s * 0.4 };
  const dots = componentsIn(clean, box)
    .filter((part) => {
      const w = widthOf(part) / s;
      const h = heightOf(part) / s;
      return w >= 0.18 && w <= 0.62 && h >= 0.18 && h <= 0.62 && fillOf(part) >= 0.55;
    })
    .filter((part) => part.left > box.left && part.right < box.right && part.top > box.top && part.bottom < box.bottom);
  return Math.min(dots.length, 2);
}

function accidentalBefore(clean: InkImage, head: NoteHead, staff: Staff, stemsX: readonly number[]): number | null {
  const s = staff.spacing;
  const halfWidth = s * 0.58;
  const from = head.x - halfWidth - s * 1.7;
  const to = head.x - halfWidth - 1;
  const strokes: Array<{ x: number; top: number; bottom: number }> = [];
  for (let x = Math.ceil(from); x <= to; x += 1) {
    if (stemsX.some((stem) => Math.abs(stem - x) <= 2)) continue;
    let y = Math.round(head.y);
    const start = [0, -1, 1, -2, 2, -3, 3].map((d) => y + d).find((row) => isInk(clean, x, row));
    if (start === undefined) continue;
    y = start;
    let top = y;
    let bottom = y;
    while (isInk(clean, x, top - 1)) top -= 1;
    while (isInk(clean, x, bottom + 1)) bottom += 1;
    if (bottom - top + 1 < s * 1.3 || bottom - top + 1 > s * 3.6) continue;
    const last = strokes[strokes.length - 1];
    if (last && x - last.x <= 2) strokes[strokes.length - 1] = { x, top: Math.min(last.top, top), bottom: Math.max(last.bottom, bottom) };
    else strokes.push({ x, top, bottom });
  }
  if (strokes.length === 0) return null;
  const nearest = strokes.slice(-2);
  const right = nearest[nearest.length - 1];
  const left = nearest.length === 2 ? nearest[0] : undefined;
  if (!right) return null;
  if (left && right.x - left.x <= s * 0.8) {
    const shift = (right.top - left.top) / s;
    return shift > 0.5 ? 0 : 1;
  }
  const above = (head.y - right.top) / s;
  const below = (right.bottom - head.y) / s;
  if (above > 1 && below < 1) return -1;
  return null;
}

function arcBetween(clean: InkImage, from: NoteHead, toX: number, staff: Staff): boolean {
  const s = staff.spacing;
  const start = from.x + s * 0.75;
  const end = toX - s * 0.75;
  if (end - start < s * 0.3) return false;
  let hits = 0;
  let total = 0;
  for (let x = start; x <= end; x += 2) {
    total += 1;
    for (let dy = -s * 1.8; dy <= s * 1.8; dy += 1) {
      if (!isInk(clean, x, from.y + dy)) continue;
      let thickness = 1;
      while (thickness < s && isInk(clean, x, from.y + dy + thickness)) thickness += 1;
      if (thickness <= s * 0.5) {
        hits += 1;
        break;
      }
      dy += thickness;
    }
  }
  return total > 0 && hits / total >= 0.75;
}

function beamLinksStems(clean: InkImage, a: NoteHead, b: NoteHead, staff: Staff): boolean {
  if (!a.stem || !b.stem || a.stem.up !== b.stem.up) return false;
  const aTip = a.stem.up ? a.stem.top : a.stem.bottom;
  const bTip = b.stem.up ? b.stem.top : b.stem.bottom;
  const inward = a.stem.up ? staff.spacing * 0.2 : -staff.spacing * 0.2;
  const steps = Math.max(1, Math.abs(b.stem.x - a.stem.x));
  let hits = 0;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    if (isInk(clean, a.stem.x + (b.stem.x - a.stem.x) * t, aTip + (bTip - aTip) * t + inward)) hits += 1;
  }
  return hits / (steps + 1) >= 0.8;
}

function restQuartersOf(part: Component, staff: Staff): number | null {
  const s = staff.spacing;
  const width = widthOf(part) / s;
  const height = heightOf(part) / s;
  const fill = fillOf(part);
  const isBar = width >= 0.9 && width <= 1.7 && height >= 0.25 && height <= 0.75 && fill >= 0.8;
  if (isBar) {
    const middle = (part.top + part.bottom) / 2;
    return middle < staff.top + s * 1.5 ? 4 : 2;
  }
  if (width < 0.45 || width > 1.5 || fill < 0.18) return null;
  if (height >= 1.3 && height < 2.3) return 0.5;
  if (height >= 2.3 && height <= 3.6) return width >= SIXTEENTH_REST_MIN_WIDTH ? 0.25 : 1;
  if (height > 3.6 && height <= 4.6) return 0.125;
  return null;
}

function restsIn(clean: InkImage, staff: Staff, fromX: number, toX: number, heads: readonly NoteHead[]): ReadNote[] {
  const s = staff.spacing;
  const box = { left: fromX, right: toX, top: staff.top - s * 0.25, bottom: staff.bottom + s * 0.25 };
  const rests: ReadNote[] = [];
  const parts = joinVertically(componentsIn(clean, box), s);
  for (const part of parts) {
    if (part.left <= box.left + 1 || part.right >= box.right - 1) continue;
    const touchesHead = heads.some((head) => {
      const near = head.x + s * 0.8 >= part.left && head.x - s * 0.8 <= part.right;
      const stem = head.stem;
      return near || (stem !== null && stem.x >= part.left - 2 && stem.x <= part.right + 2);
    });
    if (touchesHead) continue;
    const quarters = restQuartersOf(part, staff);
    if (quarters === null) continue;
    if (strokesOf(clean, part, s * REST_MAX_STROKE_SPACES).length > 0) continue;
    const dotted = countDots(clean, part.right + 1, staff.top + s * 1.5, s) > 0 || countDots(clean, part.right + 1, staff.top + s * 2.5, s) > 0;
    rests.push({
      x: (part.left + part.right) / 2,
      isRest: true,
      midi: [],
      positions: [],
      writtenAlters: [],
      quarters: dotted ? quarters * 1.5 : quarters,
      dots: dotted ? 1 : 0,
      beamedToNext: false,
      tiedToNext: false,
      triplet: false,
    });
  }
  return rests;
}

function joinVertically(parts: readonly Component[], spacing: number): Component[] {
  const joined: Component[] = [];
  for (const part of [...parts].sort((a, b) => a.top - b.top)) {
    const index = joined.findIndex((other) => {
      const overlap = Math.min(other.right, part.right) - Math.max(other.left, part.left);
      return overlap > 0 && part.top - other.bottom <= spacing * 0.45;
    });
    const other = joined[index];
    if (other) {
      joined[index] = {
        left: Math.min(other.left, part.left),
        right: Math.max(other.right, part.right),
        top: Math.min(other.top, part.top),
        bottom: Math.max(other.bottom, part.bottom),
        pixels: other.pixels + part.pixels,
      };
    } else {
      joined.push(part);
    }
  }
  return joined;
}

function groupChords(heads: readonly NoteHead[], staff: Staff): NoteHead[][] {
  const groups: NoteHead[][] = [];
  const near = staff.spacing * CHORD_X_SPACES;
  for (const head of heads) {
    const group = groups.find((candidate) =>
      candidate.some((other) => {
        const sameStem = other.stem !== null && head.stem !== null && Math.abs(other.stem.x - head.stem.x) <= 2;
        return sameStem || Math.abs(other.x - head.x) <= near;
      }),
    );
    if (group) group.push(head);
    else groups.push([head]);
  }
  return groups;
}

function baseQuarters(head: NoteHead, clean: InkImage, staff: Staff): number {
  if (head.kind === "whole") return 4;
  if (head.kind === "hollow") return 2;
  const stem = head.stem;
  if (!stem) return 1;
  const beams = beamsOnStem(clean, stem, head.y, staff);
  return 1 / 2 ** (beams > 0 ? beams : hasFlag(clean, stem, staff) ? 1 : 0);
}

function withoutStrayWholes(heads: readonly NoteHead[]): NoteHead[] {
  const stemmed = heads.filter((head) => head.kind !== "whole");
  return stemmed.length > 0 ? stemmed : [...heads];
}

function headsOfMeasure(ink: InkImage, clean: InkImage, staff: Staff, fromX: number, toX: number): NoteHead[] {
  const stemmed = withoutStrayWholes(findNoteHeads(ink, clean, staff, fromX, toX));
  if (stemmed.length > 0) return stemmed;
  const stemless = findNoteHeads(ink, clean, staff, fromX, toX, true);
  return stemless.length >= MIN_STEMLESS_HEADS ? stemless : stemmed;
}

export function readMeasureNotes(ink: InkImage, clean: InkImage, staff: Staff, fromX: number, toX: number): ReadNote[] {
  const heads = headsOfMeasure(ink, clean, staff, fromX, toX);
  const chords = groupChords(heads, staff).sort((a, b) => (a[0]?.x ?? 0) - (b[0]?.x ?? 0));
  const stemsX = heads.flatMap((head) => (head.stem ? [head.stem.x] : []));
  const heldAlters = new Map<number, number>();
  const notes: ReadNote[] = chords.map((chord, index) => {
    const lead = chord[0] as NoteHead;
    const sorted = [...chord].sort((a, b) => b.position - a.position);
    const writtenAlters = sorted.map((head) => {
      const written = accidentalBefore(clean, head, staff, stemsX);
      if (written !== null) heldAlters.set(head.position, written);
      return heldAlters.get(head.position) ?? null;
    });
    const next = chords[index + 1]?.[0];
    const dots = Math.max(...chord.map((head) => dotsBeside(clean, head, staff)));
    const quarters = baseQuarters(lead, clean, staff);
    const samePitch = next ? chord.some((head) => chords[index + 1]?.some((other) => other.position === head.position)) : false;
    return {
      x: lead.x,
      isRest: false,
      midi: [],
      positions: sorted.map((head) => head.position),
      writtenAlters,
      quarters: quarters * (dots === 1 ? 1.5 : dots === 2 ? 1.75 : 1),
      dots,
      beamedToNext: next ? beamLinksStems(clean, lead, next, staff) : false,
      tiedToNext: next !== undefined && samePitch && arcBetween(clean, lead, next.x, staff),
      triplet: false,
    };
  });
  const rests = restsIn(clean, staff, fromX, toX, heads);
  return [...notes, ...rests].sort((a, b) => a.x - b.x);
}

export function withPitches(notes: readonly ReadNote[], fifths: number): ReadNote[] {
  return notes.map((note) => ({
    ...note,
    midi: note.positions.map((position, index) => midiOf(position, note.writtenAlters[index] ?? alterFromKey(stepOfPosition(position).step, fifths))),
  }));
}
