import { estimateSkewSlope, straightened, type InkImage } from "./raster";
import { lineThickness, nearestRun, LINE_REACH_SPACES, longestLineRun, TRACKING_RATE } from "./staffCleaning";
import { findStaves, type Staff } from "./staves";

const MIN_WORTHWHILE_BEND_PX = 1;

function lineDrift(image: InkImage, line: number, reach: number, longest: number): Float32Array {
  const drift = new Float32Array(image.width);
  const follow = (x: number, estimate: number): number => {
    const center = nearestRun(image, x, estimate, reach, longest);
    const next = center === null ? estimate : estimate + (center - estimate) * TRACKING_RATE;
    drift[x] = next - line;
    return next;
  };
  const middle = Math.floor(image.width / 2);
  let estimate = line;
  for (let x = middle; x < image.width; x += 1) estimate = follow(x, estimate);
  estimate = line;
  for (let x = middle - 1; x >= 0; x -= 1) estimate = follow(x, estimate);
  return drift;
}

function middleValue(values: readonly number[]): number {
  return [...values].sort((one, other) => one - other)[Math.floor(values.length / 2)] ?? 0;
}

function staffBend(image: InkImage, staff: Staff): Int16Array {
  const longest = longestLineRun(lineThickness(image, staff), staff.spacing);
  const reach = staff.spacing * LINE_REACH_SPACES;
  const drifts = staff.lines.map((line) => lineDrift(image, line, reach, longest));
  const bend = new Int16Array(image.width);
  for (let x = 0; x < image.width; x += 1) bend[x] = Math.round(middleValue(drifts.map((drift) => drift[x] ?? 0)));
  return bend;
}

function withColumnsShifted(image: InkImage, staves: readonly Staff[], bends: readonly Int16Array[]): InkImage {
  const ink = new Uint8Array(image.ink.length);
  let rowStart = 0;
  staves.forEach((staff, index) => {
    const next = staves[index + 1];
    const rowEnd = next ? Math.floor((staff.bottom + next.top) / 2) : image.height - 1;
    const bend = bends[index];
    for (let y = rowStart; y <= rowEnd; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if (image.ink[y * image.width + x] !== 1) continue;
        const row = y - (bend?.[x] ?? 0);
        if (row >= 0 && row < image.height) ink[row * image.width + x] = 1;
      }
    }
    rowStart = rowEnd + 1;
  });
  return { width: image.width, height: image.height, ink };
}

const leveledBySource = new WeakMap<InkImage, InkImage>();

export function leveledPage(source: InkImage): InkImage {
  const known = leveledBySource.get(source);
  if (known) return known;
  const leveled = computeLeveledPage(source);
  leveledBySource.set(source, leveled);
  return leveled;
}

function computeLeveledPage(source: InkImage): InkImage {
  const image = straightened(source, estimateSkewSlope(source));
  const staves = findStaves(image);
  const bends = staves.map((staff) => staffBend(image, staff));
  const isBent = bends.some((bend) => bend.some((shift) => Math.abs(shift) >= MIN_WORTHWHILE_BEND_PX));
  return isBent ? withColumnsShifted(image, staves, bends) : image;
}
