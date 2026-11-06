import type { InkImage } from "./raster";
import type { Staff } from "./staves";

export type HeadKind = "filled" | "hollow" | "whole";

export interface Stem {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
  readonly up: boolean;
}

export interface NoteHead {
  readonly x: number;
  readonly y: number;
  readonly position: number;
  readonly kind: HeadKind;
  readonly score: number;
  readonly stem: Stem | null;
}

const LOWEST_POSITION = -6;
const HIGHEST_POSITION = 22;
const LEDGER_REACH_SPACES = 0.78;
const STEM_PROBES = [0.9, 1.3, 1.7];
const STEM_MAX_RUN_SPACES = 0.7;
const FILLED_RX = 0.5;
const FILLED_RY = 0.36;
const FILLED_MIN_SCORE = 0.86;
const FLAG_NEAR_SPACES = 0.25;
const FLAG_FAR_SPACES = 0.7;
const FLAG_REACH_SPACES = 1.7;
const FLAG_MIN_COLUMNS = 0.8;
const FILLED_MIN_HEIGHT_SPACES = 0.78;
const QUADRANT_MIN_RING = 0.4;
const HOLLOW_RX = 0.56;
const HOLLOW_RY = 0.42;
const WHOLE_RX = 0.76;
const HOLLOW_MIN_RING = 0.62;
const HOLLOW_MAX_CENTER = 0.22;
const WHOLE_MIN_RING = 0.8;
const WHOLE_OUTSIDE = 1.35;
const WHOLE_MAX_OUTSIDE = 0.2;
const MOST_RUN_SPACES = 2.3;
const MIN_STEM_SPACES = 2.2;
const SAME_HEAD_X_SPACES = 0.7;
const SAMPLES = 32;
const SAME_STEM_X_PX = 2;
const BEAM_PROBES = [1.2, 1.7];
const BEAM_BAND_SPACES = 0.75;
const BEAM_MIN_THICKNESS_SPACES = 0.45;
const BEAM_MAX_THICKNESS_SPACES = 1.3;

export function yOfPosition(staff: Staff, position: number): number {
  return staff.bottom - (position * staff.spacing) / 2;
}

function isInk(image: InkImage, x: number, y: number): boolean {
  const px = Math.round(x);
  const py = Math.round(y);
  return px >= 0 && py >= 0 && px < image.width && py < image.height && image.ink[py * image.width + px] === 1;
}

function discRatio(image: InkImage, x: number, y: number, rx: number, ry: number): number {
  let inked = 0;
  let total = 0;
  const left = Math.ceil(rx);
  const up = Math.ceil(ry);
  for (let dy = -up; dy <= up; dy += 1) {
    for (let dx = -left; dx <= left; dx += 1) {
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue;
      total += 1;
      if (isInk(image, x + dx, y + dy)) inked += 1;
    }
  }
  return total > 0 ? inked / total : 0;
}

function ringRatio(image: InkImage, x: number, y: number, rx: number, ry: number): number {
  let inked = 0;
  for (let step = 0; step < SAMPLES; step += 1) {
    const angle = (step / SAMPLES) * Math.PI * 2;
    if (isInk(image, x + Math.cos(angle) * rx, y + Math.sin(angle) * ry)) inked += 1;
  }
  return inked / SAMPLES;
}

function ringQuadrantsClosed(image: InkImage, x: number, y: number, rx: number, ry: number): boolean {
  const hits = [0, 0, 0, 0];
  for (let step = 0; step < SAMPLES; step += 1) {
    const angle = ((step + 0.5) / SAMPLES) * Math.PI * 2;
    if (isInk(image, x + Math.cos(angle) * rx, y + Math.sin(angle) * ry)) {
      const quadrant = Math.floor((step / SAMPLES) * 4);
      hits[quadrant] = (hits[quadrant] ?? 0) + 1;
    }
  }
  return hits.every((count) => count >= (SAMPLES / 4) * QUADRANT_MIN_RING);
}

function columnRun(image: InkImage, x: number, y: number): number {
  const px = Math.round(x);
  let top = Math.round(y);
  let bottom = top;
  if (!isInk(image, px, top)) return 0;
  while (isInk(image, px, top - 1)) top -= 1;
  while (isInk(image, px, bottom + 1)) bottom += 1;
  return bottom - top + 1;
}

function horizontalRun(image: InkImage, x: number, y: number): number {
  const py = Math.round(y);
  let left = Math.round(x);
  let right = left;
  if (!isInk(image, left, py)) return 0;
  while (isInk(image, left - 1, py)) left -= 1;
  while (isInk(image, right + 1, py)) right += 1;
  return right - left + 1;
}

function hasLedgerAt(clean: InkImage, x: number, position: number, staff: Staff): boolean {
  const y = yOfPosition(staff, position);
  const reach = staff.spacing * LEDGER_REACH_SPACES;
  for (let dy = -2; dy <= 2; dy += 1) {
    if (isInk(clean, x - reach, y + dy) || isInk(clean, x + reach, y + dy)) return true;
  }
  return false;
}

function hasLedgerSupport(clean: InkImage, x: number, position: number, staff: Staff): boolean {
  if (position >= -1 && position <= 9) return true;
  const direction = position < 0 ? -1 : 1;
  const nearest = position < 0 ? -2 : 10;
  for (let ledger = nearest; ledger * direction <= position * direction; ledger += 2 * direction) {
    if (!hasLedgerAt(clean, x, ledger, staff)) return false;
  }
  return true;
}

function stemNear(clean: InkImage, x: number, y: number, staff: Staff, halfWidth: number): Stem | null {
  const s = staff.spacing;
  const minimum = s * MIN_STEM_SPACES;
  let best: Stem | null = null;
  let bestLength = minimum - 1;
  const reachFrom = halfWidth - s * 0.25;
  const reachTo = halfWidth + s * 0.32;
  for (const side of [1, -1]) {
    for (let dx = reachFrom; dx <= reachTo; dx += 1) {
      const sx = Math.round(x + side * dx);
      let top = Math.round(y);
      let bottom = top;
      const startsAt = [0, -1, 1, -2, 2, -3, 3].map((d) => Math.round(y) + d).find((row) => isInk(clean, sx, row));
      if (startsAt === undefined) continue;
      top = startsAt;
      bottom = startsAt;
      while (isInk(clean, sx, top - 1)) top -= 1;
      while (isInk(clean, sx, bottom + 1)) bottom += 1;
      const up = side === 1;
      const length = up ? y - top : bottom - y;
      if (length <= bestLength) continue;
      const direction = up ? -1 : 1;
      const isNarrow = STEM_PROBES.some((probe) => horizontalRun(clean, sx, y + direction * s * probe) <= s * STEM_MAX_RUN_SPACES);
      if (!isNarrow) continue;
      bestLength = length;
      best = { x: sx, top, bottom, up };
    }
  }
  return best;
}

function continuesLikeBeam(clean: InkImage, x: number, y: number, stem: Stem, s: number): boolean {
  const away = x >= stem.x ? 1 : -1;
  return BEAM_PROBES.every((probe) => {
    const column = x + away * s * probe;
    for (let dy = -s * BEAM_BAND_SPACES; dy <= s * BEAM_BAND_SPACES; dy += 1) {
      const run = columnRun(clean, column, y + dy);
      if (run >= s * BEAM_MIN_THICKNESS_SPACES && run <= s * BEAM_MAX_THICKNESS_SPACES) return true;
    }
    return false;
  });
}

function candidateAt(ink: InkImage, clean: InkImage, x: number, position: number, staff: Staff, allowStemless: boolean): NoteHead | null {
  const s = staff.spacing;
  const y = yOfPosition(staff, position);
  const filled = discRatio(ink, x, y, s * FILLED_RX, s * FILLED_RY);
  if (filled >= FILLED_MIN_SCORE) {
    if (horizontalRun(clean, x, y) > s * MOST_RUN_SPACES) return null;
    if (columnRun(ink, x, y) < s * FILLED_MIN_HEIGHT_SPACES) return null;
    const stem = stemNear(clean, x, y, staff, s * 0.58);
    if ((!stem && !allowStemless) || !hasLedgerSupport(clean, x, position, staff)) return null;
    if (stem && continuesLikeBeam(clean, x, y, stem, s)) return null;
    return { x, y, position, kind: "filled", score: filled, stem };
  }
  const center = discRatio(clean, x, y, s * 0.27, s * 0.16);
  if (center > HOLLOW_MAX_CENTER) return null;
  const hollowRing = ringRatio(ink, x, y, s * HOLLOW_RX, s * HOLLOW_RY);
  if (hollowRing >= HOLLOW_MIN_RING && ringQuadrantsClosed(ink, x, y, s * HOLLOW_RX, s * HOLLOW_RY)) {
    const stem = stemNear(clean, x, y, staff, s * 0.58);
    if (stem && hasLedgerSupport(clean, x, position, staff)) return { x, y, position, kind: "hollow", score: hollowRing, stem };
  }
  const wholeRing = ringRatio(ink, x, y, s * WHOLE_RX, s * HOLLOW_RY);
  if (wholeRing < WHOLE_MIN_RING || !hasLedgerSupport(clean, x, position, staff)) return null;
  const outside = ringRatio(clean, x, y, s * WHOLE_RX * WHOLE_OUTSIDE, s * HOLLOW_RY * WHOLE_OUTSIDE * 1.25);
  if (outside > WHOLE_MAX_OUTSIDE || stemNear(clean, x, y, staff, s * WHOLE_RX)) return null;
  return { x, y, position, kind: "whole", score: wholeRing, stem: null };
}

function withoutOppositeStemEnds(heads: readonly NoteHead[]): NoteHead[] {
  return heads.filter((head) => {
    const stem = head.stem;
    if (!stem) return true;
    return !heads.some((other) => {
      const otherStem = other.stem;
      if (!otherStem || otherStem.up === stem.up || Math.abs(otherStem.x - stem.x) > SAME_STEM_X_PX) return false;
      return other.score > head.score || (other.score === head.score && otherStem.up);
    });
  });
}

export function findNoteHeads(ink: InkImage, clean: InkImage, staff: Staff, fromX: number, toX: number, allowStemless = false): NoteHead[] {
  const raw: NoteHead[] = [];
  for (let x = Math.ceil(fromX); x <= toX; x += 1) {
    for (let position = LOWEST_POSITION; position <= HIGHEST_POSITION; position += 1) {
      const head = candidateAt(ink, clean, x, position, staff, allowStemless);
      if (head) raw.push(head);
    }
  }
  const sameHead = staff.spacing * SAME_HEAD_X_SPACES;
  const kept: NoteHead[] = [];
  for (const head of [...raw].sort((a, b) => b.score - a.score)) {
    const clash = kept.some((other) => Math.abs(other.x - head.x) < sameHead && Math.abs(other.position - head.position) <= 1);
    if (!clash) kept.push(head);
  }
  const insideMeasure = kept.filter((head) => !head.stem || (head.stem.x >= fromX && head.stem.x <= toX));
  return withoutOppositeStemEnds(insideMeasure).sort((a, b) => a.x - b.x || b.position - a.position);
}

export function hasFlag(clean: InkImage, stem: Stem, staff: Staff): boolean {
  const s = staff.spacing;
  const tip = stem.up ? stem.top : stem.bottom;
  const direction = stem.up ? 1 : -1;
  const fromX = Math.round(stem.x + s * FLAG_NEAR_SPACES);
  const toX = Math.round(stem.x + s * FLAG_FAR_SPACES);
  let columnsWithInk = 0;
  for (let x = fromX; x <= toX; x += 1) {
    for (let step = 0; step <= s * FLAG_REACH_SPACES; step += 1) {
      if (!isInk(clean, x, tip + direction * step)) continue;
      columnsWithInk += 1;
      break;
    }
  }
  return columnsWithInk / Math.max(1, toX - fromX + 1) >= FLAG_MIN_COLUMNS;
}

export function beamsOnStem(clean: InkImage, stem: Stem, headY: number, staff: Staff): number {
  const s = staff.spacing;
  const minimumThickness = Math.max(2, s * 0.26);
  const biggestGap = s * 0.75;
  const tip = stem.up ? stem.top : stem.bottom;
  const direction = stem.up ? 1 : -1;
  const stopAt = headY - direction * s * 0.9;
  let best = 0;
  for (const side of [1, -1]) {
    for (const offset of [0.36, 0.5]) {
      const x = stem.x + side * s * offset;
      let count = 0;
      let lastEnd = tip;
      let y = tip;
      while ((y - stopAt) * direction <= 0) {
        if (!isInk(clean, x, y)) {
          y += direction;
          continue;
        }
        const start = y;
        while (isInk(clean, x, y) && (y - stopAt) * direction <= 0) y += direction;
        const thickness = Math.abs(y - start);
        if (Math.abs(start - lastEnd) > biggestGap) break;
        if (thickness >= minimumThickness) {
          count += 1;
          lastEnd = y;
        }
      }
      best = Math.max(best, count);
    }
  }
  return best;
}
