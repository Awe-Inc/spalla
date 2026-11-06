import type { InkImage } from "./raster";

export interface Staff {
  readonly lines: readonly number[];
  readonly top: number;
  readonly bottom: number;
  readonly spacing: number;
  readonly left: number;
  readonly right: number;
}

export interface StaffSystem {
  readonly staves: readonly Staff[];
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

const MINIMUM_LINE_RUN = 0.12;
const LINE_RUN_GAP = 3;
const LINES_PER_STAFF = 5;
const SPACING_TOLERANCE = 0.3;

interface RowBand {
  readonly center: number;
  readonly thickness: number;
}

function longestRun(image: InkImage, y: number): number {
  const current = y * image.width;
  const next = (y + 1 < image.height ? y + 1 : y) * image.width;
  let longest = 0;
  let start = -1;
  let lastInk = -1;
  for (let x = 0; x < image.width; x += 1) {
    if (image.ink[current + x] !== 1 && image.ink[next + x] !== 1) continue;
    if (start < 0 || x - lastInk > LINE_RUN_GAP) start = x;
    lastInk = x;
    longest = Math.max(longest, x - start + 1);
  }
  return longest;
}

function darkRowBands(image: InkImage): RowBand[] {
  const required = image.width * MINIMUM_LINE_RUN;
  const bands: RowBand[] = [];
  let start = -1;
  for (let y = 0; y <= image.height; y += 1) {
    const isLine = y < image.height && longestRun(image, y) >= required;
    if (isLine) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      bands.push({ center: (start + y - 1) / 2, thickness: y - start });
      start = -1;
    }
  }
  return bands;
}

function staffExtent(image: InkImage, lines: readonly number[]): { left: number; right: number } {
  const row = Math.round(lines[2] ?? 0);
  const thicknessReach = 2;
  const isLineAt = (x: number) => {
    for (let dy = -thicknessReach; dy <= thicknessReach; dy += 1) {
      if (image.ink[(row + dy) * image.width + x] === 1) return true;
    }
    return false;
  };
  const allowedGap = Math.max(4, Math.round(((lines[4] ?? 0) - (lines[0] ?? 0)) / 2));
  let best = { left: 0, right: -1 };
  let start = -1;
  let lastInk = -1;
  for (let x = 0; x < image.width; x += 1) {
    if (!isLineAt(x)) continue;
    if (start < 0 || x - lastInk > allowedGap) start = x;
    lastInk = x;
    if (x - start > best.right - best.left) best = { left: start, right: x };
  }
  return best;
}

export function findStaves(image: InkImage): Staff[] {
  const bands = darkRowBands(image);
  const staves: Staff[] = [];
  let index = 0;
  while (index + LINES_PER_STAFF <= bands.length) {
    const group = bands.slice(index, index + LINES_PER_STAFF);
    const gaps = group.slice(1).map((band, i) => band.center - (group[i]?.center ?? 0));
    const spacing = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const even = gaps.every((gap) => Math.abs(gap - spacing) <= Math.max(1.5, spacing * SPACING_TOLERANCE));
    if (!even || spacing < 3) {
      index += 1;
      continue;
    }
    const lines = group.map((band) => band.center);
    const { left, right } = staffExtent(image, lines);
    staves.push({ lines, top: lines[0] ?? 0, bottom: lines[4] ?? 0, spacing, left, right });
    index += LINES_PER_STAFF;
  }
  return staves;
}

const BRACE_COVERAGE = 0.85;

function joinedAtLeft(image: InkImage, upper: Staff, lower: Staff): boolean {
  const from = Math.round(upper.bottom);
  const to = Math.round(lower.top);
  const span = to - from;
  if (span <= 0) return false;
  const start = Math.max(0, Math.min(upper.left, lower.left) - Math.round(upper.spacing));
  const end = Math.min(image.width - 1, Math.min(upper.left, lower.left) + Math.round(upper.spacing));
  for (let x = start; x <= end; x += 1) {
    let dark = 0;
    for (let y = from; y <= to; y += 1) dark += image.ink[y * image.width + x] ?? 0;
    if (dark >= span * BRACE_COVERAGE) return true;
  }
  return false;
}

export function groupSystems(image: InkImage, staves: readonly Staff[]): StaffSystem[] {
  const systems: Staff[][] = [];
  for (const staff of staves) {
    const current = systems.at(-1);
    const previous = current?.at(-1);
    if (current && previous && joinedAtLeft(image, previous, staff)) current.push(staff);
    else systems.push([staff]);
  }
  return systems.map((group) => ({
    staves: group,
    top: group[0]?.top ?? 0,
    bottom: group.at(-1)?.bottom ?? 0,
    left: Math.min(...group.map((staff) => staff.left)),
    right: Math.max(...group.map((staff) => staff.right)),
  }));
}
