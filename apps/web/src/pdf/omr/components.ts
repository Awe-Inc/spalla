import type { InkImage } from "./raster";

export interface Component {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly pixels: number;
}

export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export function componentsIn(image: InkImage, box: Box): Component[] {
  const left = Math.max(0, Math.floor(box.left));
  const right = Math.min(image.width - 1, Math.ceil(box.right));
  const top = Math.max(0, Math.floor(box.top));
  const bottom = Math.min(image.height - 1, Math.ceil(box.bottom));
  const width = right - left + 1;
  const height = bottom - top + 1;
  if (width <= 0 || height <= 0) return [];
  const seen = new Uint8Array(width * height);
  const found: Component[] = [];
  const stack: number[] = [];
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const start = (y - top) * width + (x - left);
      if (seen[start] === 1 || image.ink[y * image.width + x] !== 1) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixels = 0;
      seen[start] = 1;
      stack.push(x, y);
      while (stack.length > 0) {
        const cy = stack.pop() ?? 0;
        const cx = stack.pop() ?? 0;
        pixels += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < left || nx > right || ny < top || ny > bottom) continue;
            const index = (ny - top) * width + (nx - left);
            if (seen[index] === 1 || image.ink[ny * image.width + nx] !== 1) continue;
            seen[index] = 1;
            stack.push(nx, ny);
          }
        }
      }
      found.push({ left: minX, right: maxX, top: minY, bottom: maxY, pixels });
    }
  }
  return found;
}

export function fillOf(component: Component): number {
  return component.pixels / ((component.right - component.left + 1) * (component.bottom - component.top + 1));
}

export function widthOf(box: Box): number {
  return box.right - box.left + 1;
}

export function heightOf(box: Box): number {
  return box.bottom - box.top + 1;
}

export function strokesOf(image: InkImage, component: Component, minimumLength: number): Array<{ x: number; top: number; bottom: number }> {
  const strokes: Array<{ x: number; top: number; bottom: number }> = [];
  for (let x = component.left; x <= component.right; x += 1) {
    let best: { top: number; bottom: number } | null = null;
    let start = -1;
    for (let y = component.top; y <= component.bottom + 1; y += 1) {
      const isInk = y <= component.bottom && image.ink[y * image.width + x] === 1;
      if (isInk && start < 0) start = y;
      if (!isInk && start >= 0) {
        if (!best || y - 1 - start > best.bottom - best.top) best = { top: start, bottom: y - 1 };
        start = -1;
      }
    }
    if (!best || best.bottom - best.top + 1 < minimumLength) continue;
    const last = strokes[strokes.length - 1];
    if (last && x - last.x <= 2) {
      if (best.bottom - best.top > last.bottom - last.top) strokes[strokes.length - 1] = { x, ...best };
      else strokes[strokes.length - 1] = { ...last, x };
    } else {
      strokes.push({ x, ...best });
    }
  }
  return strokes;
}
