import type { InkImage } from "./raster";
import type { Staff } from "./staves";

export const LINE_REACH_SPACES = 0.3;
const MAX_THICKNESS_SPACES = 0.4;
export const TRACKING_RATE = 0.15;
const THICKNESS_MARGIN_PX = 1;

function verticalRun(image: InkImage, x: number, y: number): { top: number; bottom: number } | null {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return null;
  if (image.ink[y * image.width + x] !== 1) return null;
  let top = y;
  let bottom = y;
  while (top > 0 && image.ink[(top - 1) * image.width + x] === 1) top -= 1;
  while (bottom + 1 < image.height && image.ink[(bottom + 1) * image.width + x] === 1) bottom += 1;
  return { top, bottom };
}

export function nearestRun(image: InkImage, x: number, around: number, reach: number, longest: number): number | null {
  let bestCenter: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const from = Math.round(around - reach);
  const to = Math.round(around + reach);
  for (let y = from; y <= to; y += 1) {
    const run = verticalRun(image, x, y);
    if (!run) continue;
    y = run.bottom;
    if (run.bottom - run.top + 1 > longest) continue;
    const center = (run.top + run.bottom) / 2;
    const distance = Math.abs(center - around);
    if (distance < bestDistance) {
      bestCenter = center;
      bestDistance = distance;
    }
  }
  return bestCenter;
}

export function lineThickness(image: InkImage, staff: Staff): number {
  const counts = new Map<number, number>();
  const step = Math.max(1, Math.floor((staff.right - staff.left) / 200));
  const reach = staff.spacing * LINE_REACH_SPACES;
  const tallest = Math.max(2, Math.round(staff.spacing * MAX_THICKNESS_SPACES));
  for (const line of staff.lines) {
    for (let x = Math.floor(staff.left); x < staff.right; x += step) {
      const center = nearestRun(image, x, line, reach, tallest);
      if (center === null) continue;
      const run = verticalRun(image, x, Math.round(center));
      if (!run) continue;
      const length = run.bottom - run.top + 1;
      counts.set(length, (counts.get(length) ?? 0) + 1);
    }
  }
  let best = 1;
  let bestCount = -1;
  for (const [length, count] of counts) {
    if (count > bestCount) {
      best = length;
      bestCount = count;
    }
  }
  return best;
}

function eraseAlongLine(image: InkImage, ink: Uint8Array, line: number, staff: Staff, longest: number): void {
  const reach = staff.spacing * LINE_REACH_SPACES;
  const erase = (x: number, estimate: number): number => {
    const center = nearestRun(image, x, estimate, reach, longest);
    if (center === null) return estimate;
    const run = verticalRun(image, x, Math.round(center));
    if (run) for (let row = run.top; row <= run.bottom; row += 1) ink[row * image.width + x] = 0;
    return estimate + (center - estimate) * TRACKING_RATE;
  };
  const middle = Math.round((staff.left + staff.right) / 2);
  let estimate = line;
  for (let x = middle; x <= staff.right; x += 1) estimate = erase(x, estimate);
  estimate = line;
  for (let x = middle - 1; x >= Math.floor(staff.left); x -= 1) estimate = erase(x, estimate);
}

export function longestLineRun(thickness: number, spacing: number): number {
  return Math.min(thickness + THICKNESS_MARGIN_PX, Math.max(thickness, Math.round(spacing * MAX_THICKNESS_SPACES)));
}

export function withoutStaffLines(image: InkImage, staves: readonly Staff[]): InkImage {
  const ink = image.ink.slice();
  for (const staff of staves) {
    const longest = longestLineRun(lineThickness(image, staff), staff.spacing);
    for (const line of staff.lines) eraseAlongLine(image, ink, line, staff, longest);
  }
  return { width: image.width, height: image.height, ink };
}
