import type { InkImage } from "./raster";
import type { Staff, StaffSystem } from "./staves";

export type BarStyle = "single" | "double" | "final" | "repeat-start" | "repeat-end" | "repeat-both";

export interface Barline {
  readonly x: number;
  readonly style: BarStyle;
}

interface VerticalStroke {
  readonly start: number;
  readonly end: number;
  readonly width: number;
}

const FULL_HEIGHT_COVERAGE = 0.96;
const CLEF_AND_KEY_SPACES = 10;
const STEM_OVERSHOOT = 0.45;
const THICK_RATIO = 2;

function columnIsFullHeight(image: InkImage, staff: Staff, x: number): boolean {
  const top = Math.round(staff.top);
  const bottom = Math.round(staff.bottom);
  let dark = 0;
  for (let y = top; y <= bottom; y += 1) dark += image.ink[y * image.width + x] ?? 0;
  return dark >= (bottom - top + 1) * FULL_HEIGHT_COVERAGE;
}

function extendsPast(image: InkImage, staff: Staff, x: number, width: number): boolean {
  const reach = Math.round(staff.spacing * STEM_OVERSHOOT) + 1;
  const hasInk = (y: number) => {
    for (let dx = 0; dx < width; dx += 1) {
      if (image.ink[y * image.width + x + dx] === 1) return true;
    }
    return false;
  };
  const above = Math.round(staff.top) - reach;
  const below = Math.round(staff.bottom) + reach;
  return (above >= 0 && hasInk(above)) || (below < image.height && hasInk(below));
}

function fullHeightStrokes(image: InkImage, staff: Staff): VerticalStroke[] {
  const strokes: VerticalStroke[] = [];
  let start = -1;
  for (let x = staff.left; x <= staff.right + 1; x += 1) {
    if (x <= staff.right && columnIsFullHeight(image, staff, x)) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      strokes.push({ start, end: x - 1, width: x - start });
      start = -1;
    }
  }
  return strokes;
}

function medianWidth(strokes: readonly VerticalStroke[]): number {
  const widths = strokes.map((stroke) => stroke.width).sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)] ?? 1;
}

function hasDots(image: InkImage, staff: Staff, x: number, direction: -1 | 1): boolean {
  const spacing = staff.spacing;
  const second = ((staff.lines[1] ?? 0) + (staff.lines[2] ?? 0)) / 2;
  const third = ((staff.lines[2] ?? 0) + (staff.lines[3] ?? 0)) / 2;
  return [second, third].every((center) => dotNear(image, x, center, spacing, direction));
}

function dotNear(image: InkImage, x: number, centerY: number, spacing: number, direction: -1 | 1): boolean {
  const reachX = Math.round(spacing * 1.4);
  const radius = Math.max(1, Math.round(spacing * 0.17));
  const clearance = Math.max(1, Math.round(spacing * 0.12));
  for (let offset = clearance; offset <= reachX; offset += 1) {
    const cx = x + direction * offset;
    if (cx - radius < 0 || cx + radius >= image.width) return false;
    let dark = 0;
    let total = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy > radius * radius) continue;
        total += 1;
        dark += image.ink[Math.round(centerY + dy) * image.width + cx + dx] ?? 0;
      }
    }
    if (dark >= total * 0.8 && clearAroundDot(image, cx, centerY, radius)) return true;
  }
  return false;
}

function clearAroundDot(image: InkImage, cx: number, centerY: number, radius: number): boolean {
  const ring = radius + Math.max(2, Math.round(radius * 0.9));
  const rows = [Math.round(centerY - ring), Math.round(centerY + ring)];
  let light = 0;
  let total = 0;
  for (const row of rows) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      total += 1;
      if (image.ink[row * image.width + cx + dx] !== 1) light += 1;
    }
  }
  return light >= total * 0.5;
}

function clusterStyle(strokes: readonly VerticalStroke[], thin: number, image: InkImage, staff: Staff): Barline {
  const first = strokes[0];
  const last = strokes.at(-1);
  if (!first || !last) throw new Error("empty barline cluster");
  const thick = (stroke: VerticalStroke) => stroke.width >= thin * THICK_RATIO;
  const dotsBefore = hasDots(image, staff, first.start, -1);
  const dotsAfter = hasDots(image, staff, last.end, 1);
  const x = Math.round((first.start + last.end) / 2);
  const hasThick = strokes.some(thick);
  if (dotsBefore && dotsAfter && hasThick) return { x, style: "repeat-both" };
  if (dotsBefore && hasThick) return { x, style: "repeat-end" };
  if (dotsAfter && hasThick) return { x, style: "repeat-start" };
  if (strokes.length >= 2 && hasThick) return { x, style: "final" };
  if (strokes.length >= 2) return { x, style: "double" };
  return { x, style: "single" };
}

export function findBarlines(image: InkImage, system: StaffSystem): Barline[] {
  const candidatesPerStaff = system.staves.map((staff) => ({ staff, strokes: fullHeightStrokes(image, staff) }));
  const reference = candidatesPerStaff[0];
  if (!reference) return [];
  const { staff } = reference;
  const maximumWidth = Math.max(2, staff.spacing * 1.1);
  const gapJoin = staff.spacing * 1.1;
  const clean = reference.strokes.filter((stroke) => {
    if (stroke.width > maximumWidth) return false;
    if (system.staves.length > 1) {
      return system.staves.every((other) => columnsMatch(image, other, stroke));
    }
    return !extendsPast(image, staff, stroke.start, stroke.width);
  });
  if (clean.length === 0) return [];
  const thin = medianWidth(clean);
  const clusters: VerticalStroke[][] = [];
  for (const stroke of clean) {
    const current = clusters.at(-1);
    const previous = current?.at(-1);
    if (current && previous && stroke.start - previous.end <= gapJoin) current.push(stroke);
    else clusters.push([stroke]);
  }
  return clusters.map((cluster) => clusterStyle(cluster, thin, image, staff));
}

export function isRepeatStart(barline: Barline): boolean {
  return barline.style === "repeat-start" || barline.style === "repeat-both";
}

export function isRepeatEnd(barline: Barline): boolean {
  return barline.style === "repeat-end" || barline.style === "repeat-both";
}

function columnsMatch(image: InkImage, staff: Staff, stroke: VerticalStroke): boolean {
  for (let x = stroke.start; x <= stroke.end; x += 1) {
    if (columnIsFullHeight(image, staff, x)) return true;
  }
  return false;
}

export function isSystemOpening(barline: Barline, staff: Staff): boolean {
  const offset = barline.x - staff.left;
  if (barline.style === "repeat-start") return offset <= staff.spacing * CLEF_AND_KEY_SPACES;
  return barline.style === "single" && offset <= staff.spacing;
}
