export interface InkImage {
  readonly width: number;
  readonly height: number;
  readonly ink: Uint8Array;
}

const LEVELS = 256;

export function otsuThreshold(gray: Uint8Array): number {
  const histogram = new Array<number>(LEVELS).fill(0);
  for (const value of gray) histogram[value] = (histogram[value] ?? 0) + 1;
  let weightedTotal = 0;
  for (let level = 0; level < LEVELS; level += 1) weightedTotal += level * (histogram[level] ?? 0);
  let backgroundCount = 0;
  let backgroundSum = 0;
  let bestLevel = 127;
  let bestVariance = -1;
  for (let level = 0; level < LEVELS; level += 1) {
    backgroundCount += histogram[level] ?? 0;
    if (backgroundCount === 0) continue;
    const foregroundCount = gray.length - backgroundCount;
    if (foregroundCount === 0) break;
    backgroundSum += level * (histogram[level] ?? 0);
    const backgroundMean = backgroundSum / backgroundCount;
    const foregroundMean = (weightedTotal - backgroundSum) / foregroundCount;
    const variance = backgroundCount * foregroundCount * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestLevel = level;
    }
  }
  return bestLevel;
}

export function inkFromRgba(rgba: Uint8ClampedArray, width: number, height: number): InkImage {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i += 1) {
    const alpha = (rgba[i * 4 + 3] ?? 255) / 255;
    const luma = 0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0);
    gray[i] = Math.round(luma * alpha + 255 * (1 - alpha));
  }
  return inkFromGray(gray, width, height);
}

const FAINT_LINE_BIAS = 0.5;

export function inkFromGray(gray: Uint8Array, width: number, height: number): InkImage {
  const otsu = otsuThreshold(gray);
  let paperSum = 0;
  let paperCount = 0;
  for (const value of gray) {
    if (value > otsu) {
      paperSum += value;
      paperCount += 1;
    }
  }
  const paper = paperCount > 0 ? paperSum / paperCount : 255;
  const threshold = otsu + (paper - otsu) * FAINT_LINE_BIAS;
  const ink = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) ink[i] = (gray[i] ?? 255) <= threshold ? 1 : 0;
  return { width, height, ink };
}

const MAX_SKEW_DEGREES = 3;
const SKEW_STEP_DEGREES = 0.25;
const SKEW_SAMPLE_STEP = 4;

function rowProjectionSharpness(image: InkImage, slope: number): number {
  const rows = new Float64Array(image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += SKEW_SAMPLE_STEP) {
      if (image.ink[y * image.width + x] !== 1) continue;
      const row = Math.round(y + slope * (x - image.width / 2));
      if (row >= 0 && row < image.height) rows[row] = (rows[row] ?? 0) + 1;
    }
  }
  let sharpness = 0;
  for (const count of rows) sharpness += count * count;
  return sharpness;
}

export function estimateSkewSlope(image: InkImage): number {
  let bestSlope = 0;
  let bestSharpness = rowProjectionSharpness(image, 0);
  for (let degrees = -MAX_SKEW_DEGREES; degrees <= MAX_SKEW_DEGREES; degrees += SKEW_STEP_DEGREES) {
    if (degrees === 0) continue;
    const slope = Math.tan((degrees * Math.PI) / 180);
    const sharpness = rowProjectionSharpness(image, slope);
    if (sharpness > bestSharpness) {
      bestSharpness = sharpness;
      bestSlope = slope;
    }
  }
  return bestSlope;
}

export function straightened(image: InkImage, slope: number): InkImage {
  if (slope === 0) return image;
  const ink = new Uint8Array(image.ink.length);
  const center = image.width / 2;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.ink[y * image.width + x] !== 1) continue;
      const row = Math.round(y + slope * (x - center));
      if (row >= 0 && row < image.height) ink[row * image.width + x] = 1;
    }
  }
  return { width: image.width, height: image.height, ink };
}
