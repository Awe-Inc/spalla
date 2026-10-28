export type PageFit = "pagina" | "largura";

export interface Box {
  width: number;
  height: number;
}

export function pageScaleFor(page: Box, box: Box, fit: PageFit): number {
  if (page.width <= 0 || page.height <= 0 || box.width <= 0) return 1;
  const widthScale = box.width / page.width;
  if (fit === "largura" || box.height <= 0) return widthScale;
  return Math.min(widthScale, box.height / page.height);
}

export function nextFit(fit: PageFit): PageFit {
  return fit === "pagina" ? "largura" : "pagina";
}

export function pageFromTap(xRatio: number, page: number, pageCount: number): number {
  if (xRatio < 1 / 3) return Math.max(1, page - 1);
  if (xRatio > 2 / 3) return Math.min(pageCount, page + 1);
  return page;
}

const MAX_CANVAS_PIXELS = 16_000_000;

export function cappedPixelRatio(cssWidth: number, cssHeight: number, pixelRatio: number): number {
  const area = cssWidth * cssHeight;
  if (area <= 0) return pixelRatio;
  return Math.min(pixelRatio, Math.sqrt(MAX_CANVAS_PIXELS / area));
}
