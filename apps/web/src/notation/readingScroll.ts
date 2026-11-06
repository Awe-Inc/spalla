const READING_ANCHOR = 1 / 3;

export function readingAnchor(viewHeight: number): number {
  return viewHeight * READING_ANCHOR;
}

export function scrollForReading(readingY: number, viewHeight: number, contentHeight: number, anchor = readingAnchor(viewHeight)): number {
  const furthest = Math.max(0, contentHeight - viewHeight);
  return Math.min(furthest, Math.max(0, readingY - anchor));
}
