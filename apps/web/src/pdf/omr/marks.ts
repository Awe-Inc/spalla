import type { InkImage } from "./raster";
import type { StaffSystem } from "./staves";

export interface PageText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type NavigationKind = "segno" | "coda" | "toCoda" | "dalSegno" | "daCapo" | "fine";

export interface NavigationMark {
  readonly kind: NavigationKind;
  readonly x: number;
  readonly system: number;
}

export interface VoltaBracket {
  readonly x0: number;
  readonly x1: number;
  readonly system: number;
  readonly number: number | null;
}

const SEGNO_GLYPHS = /[\u{1D10B}]/u;
const CODA_GLYPHS = /[\u{1D10C}]/u;

export function classifyNavigationText(raw: string): NavigationKind | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (SEGNO_GLYPHS.test(text) && text.length <= 2) return "segno";
  if (CODA_GLYPHS.test(text) && text.length <= 2) return "coda";
  if (/^(d\.? ?s\.?|dal segno)(\W|$)/i.test(text)) return "dalSegno";
  if (/^(d\.? ?c\.?|da capo)(\W|$)/i.test(text)) return "daCapo";
  if (/^(to|al|vai? (a|à|para)( a| o)?) coda\b/i.test(text)) return "toCoda";
  if (/^coda\.?$/i.test(text)) return "coda";
  if (/^fine\.?$/i.test(text)) return "fine";
  return null;
}

const SAME_LINE_TOLERANCE = 0.6;
const SAME_PHRASE_GAP = 1.2;

export function joinedPhrases(items: readonly PageText[]): PageText[] {
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const phrases: PageText[] = [];
  for (const item of ordered) {
    const last = phrases.at(-1);
    const size = Math.max(item.height, 1);
    const sameLine = last && Math.abs(last.y - item.y) <= size * SAME_LINE_TOLERANCE;
    const close = last && item.x - (last.x + last.width) <= size * SAME_PHRASE_GAP && item.x >= last.x;
    if (last && sameLine && close) {
      phrases[phrases.length - 1] = {
        text: `${last.text} ${item.text}`,
        x: last.x,
        y: last.y,
        width: item.x + item.width - last.x,
        height: Math.max(last.height, item.height),
      };
    } else {
      phrases.push(item);
    }
  }
  return phrases;
}

const TEXT_REACH_SPACES = 8;

export function nearestSystem(systems: readonly StaffSystem[], y: number): number {
  let best = -1;
  let bestDistance = Infinity;
  systems.forEach((system, index) => {
    const spacing = system.staves[0]?.spacing ?? 1;
    const distance = y < system.top ? system.top - y : y > system.bottom ? y - system.bottom : 0;
    if (distance <= spacing * TEXT_REACH_SPACES && distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

export function navigationFromText(items: readonly PageText[], systems: readonly StaffSystem[]): NavigationMark[] {
  const marks: NavigationMark[] = [];
  for (const phrase of joinedPhrases(items)) {
    const kind = classifyNavigationText(phrase.text);
    if (!kind) continue;
    const system = nearestSystem(systems, phrase.y);
    if (system >= 0) marks.push({ kind, x: phrase.x + phrase.width / 2, system });
  }
  return marks;
}

const BRACKET_ZONE_SPACES = 6;
const BRACKET_MIN_LENGTH_SPACES = 5;
const BRACKET_HOOK_SPACES = 0.8;

function horizontalRuns(image: InkImage, y: number, x0: number, x1: number, minimum: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let x = x0; x <= x1 + 1; x += 1) {
    const dark = x <= x1 && (image.ink[y * image.width + x] === 1 || image.ink[(y + 1) * image.width + x] === 1);
    if (dark) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      if (x - start >= minimum) runs.push([start, x - 1]);
      start = -1;
    }
  }
  return runs;
}

function hasHookBelow(image: InkImage, x: number, y: number, length: number): boolean {
  for (let dx = -2; dx <= 2; dx += 1) {
    let dark = 0;
    for (let dy = 1; dy <= length; dy += 1) dark += image.ink[(y + dy) * image.width + x + dx] ?? 0;
    if (dark >= length * 0.8) return true;
  }
  return false;
}

export function findVoltaBrackets(image: InkImage, systems: readonly StaffSystem[], texts: readonly PageText[]): VoltaBracket[] {
  const brackets: VoltaBracket[] = [];
  systems.forEach((system, index) => {
    const spacing = system.staves[0]?.spacing ?? 1;
    const top = Math.max(1, Math.round(system.top - spacing * BRACKET_ZONE_SPACES));
    const bottom = Math.round(system.top - spacing * 0.5);
    const found: VoltaBracket[] = [];
    const minimum = Math.round(spacing * BRACKET_MIN_LENGTH_SPACES);
    const hook = Math.round(spacing * BRACKET_HOOK_SPACES);
    for (let y = top; y < bottom; y += 1) {
      for (const [x0, x1] of horizontalRuns(image, y, system.left, system.right, minimum)) {
        if (!hasHookBelow(image, x0 + 1, y, hook)) continue;
        if (found.some((other) => x0 <= other.x1 && x1 >= other.x0)) continue;
        const digit = texts.find((item) => {
          const inside = item.x >= x0 - spacing && item.x <= x0 + spacing * 3;
          const near = item.y >= y - spacing && item.y <= y + spacing * 3;
          return inside && near && /^\d+[.,]?(\s*,\s*\d+[.,]?)*$/.test(item.text.trim());
        });
        found.push({ x0, x1, system: index, number: digit ? Number.parseInt(digit.text, 10) : null });
      }
    }
    brackets.push(...found);
  });
  return brackets.sort((a, b) => a.system - b.system || a.x0 - b.x0);
}

interface Component {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly pixels: number;
  readonly pixelsSet: ReadonlySet<number>;
}

const MAX_COMPONENT_PIXELS = 20_000;

function componentsInZone(image: InkImage, x0: number, x1: number, y0: number, y1: number): Component[] {
  const seen = new Set<number>();
  const components: Component[] = [];
  const width = image.width;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const start = y * width + x;
      if (image.ink[start] !== 1 || seen.has(start)) continue;
      const stack = [start];
      const pixelsSet = new Set<number>();
      seen.add(start);
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (stack.length > 0 && pixelsSet.size < MAX_COMPONENT_PIXELS) {
        const position = stack.pop() as number;
        pixelsSet.add(position);
        const px = position % width;
        const py = Math.floor(position / width);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
        for (const next of [position - 1, position + 1, position - width, position + width]) {
          if (next < 0 || next >= image.ink.length || seen.has(next) || image.ink[next] !== 1) continue;
          seen.add(next);
          stack.push(next);
        }
      }
      components.push({ x0: minX, x1: maxX, y0: minY, y1: maxY, pixels: pixelsSet.size, pixelsSet });
    }
  }
  return components;
}

function holeCount(component: Component, width: number): number {
  const boxWidth = component.x1 - component.x0 + 3;
  const boxHeight = component.y1 - component.y0 + 3;
  const visited = new Uint8Array(boxWidth * boxHeight);
  const isInk = (bx: number, by: number) => component.pixelsSet.has((by + component.y0 - 1) * width + bx + component.x0 - 1);
  let regions = 0;
  const minimumHolePixels = 3;
  for (let by = 0; by < boxHeight; by += 1) {
    for (let bx = 0; bx < boxWidth; bx += 1) {
      if (visited[by * boxWidth + bx] === 1 || isInk(bx, by)) continue;
      regions += 1;
      let size = 0;
      const stack = [by * boxWidth + bx];
      visited[by * boxWidth + bx] = 1;
      while (stack.length > 0) {
        const position = stack.pop() as number;
        size += 1;
        const px = position % boxWidth;
        const py = Math.floor(position / boxWidth);
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]] as const) {
          if (nx < 0 || ny < 0 || nx >= boxWidth || ny >= boxHeight) continue;
          const index = ny * boxWidth + nx;
          if (visited[index] === 1 || isInk(nx, ny)) continue;
          visited[index] = 1;
          stack.push(index);
        }
      }
      if (regions > 1 && size < minimumHolePixels) regions -= 1;
    }
  }
  return regions - 1;
}

const SYMBOL_ZONE_SPACES = 7;
const SYMBOL_MIN_HEIGHT_SPACES = 1.2;
const SYMBOL_MAX_SIZE_SPACES = 5.5;
const CODA_HOLES = 4;
const SEGNO_MAX_HOLES = 3;
const SEGNO_MIN_TALLNESS = 1;
const SEGNO_MAX_TALLNESS = 2.2;
const SEGNO_DOT_OFFSET = 0.08;
const CODA_CROSS_COVERAGE = 0.85;

function crossCoverage(component: Component, width: number, horizontal: boolean): number {
  const length = horizontal ? component.x1 - component.x0 + 1 : component.y1 - component.y0 + 1;
  const center = horizontal ? (component.y0 + component.y1) / 2 : (component.x0 + component.x1) / 2;
  const reach = Math.max(1, Math.round((horizontal ? component.y1 - component.y0 : component.x1 - component.x0) * 0.08));
  let covered = 0;
  for (let step = 0; step < length; step += 1) {
    for (let offset = -reach; offset <= reach; offset += 1) {
      const across = Math.round(center) + offset;
      const position = horizontal ? across * width + component.x0 + step : (component.y0 + step) * width + across;
      if (component.pixelsSet.has(position)) {
        covered += 1;
        break;
      }
    }
  }
  return covered / length;
}

function isCodaShape(component: Component, imageWidth: number, width: number, height: number): boolean {
  const ratio = width / height;
  if (ratio < 0.55 || ratio > 1.4) return false;
  if (holeCount(component, imageWidth) !== CODA_HOLES) return false;
  return crossCoverage(component, imageWidth, true) >= CODA_CROSS_COVERAGE && crossCoverage(component, imageWidth, false) >= CODA_CROSS_COVERAGE;
}

export function findNavigationSymbols(image: InkImage, systems: readonly StaffSystem[]): NavigationMark[] {
  const marks: NavigationMark[] = [];
  systems.forEach((system, index) => {
    const spacing = system.staves[0]?.spacing ?? 1;
    const previousBottom = index > 0 ? (systems[index - 1]?.bottom ?? 0) + spacing : 0;
    const y0 = Math.max(1, Math.round(Math.max(previousBottom, system.top - spacing * SYMBOL_ZONE_SPACES)));
    const y1 = Math.round(system.top - spacing * 0.25);
    if (y1 <= y0) return;
    const components = componentsInZone(image, system.left, system.right, y0, y1);
    for (const component of components) {
      const height = component.y1 - component.y0 + 1;
      const width = component.x1 - component.x0 + 1;
      if (height < spacing * SYMBOL_MIN_HEIGHT_SPACES || height > spacing * SYMBOL_MAX_SIZE_SPACES) continue;
      if (width > spacing * SYMBOL_MAX_SIZE_SPACES || width < spacing * 0.8) continue;
      if (component.y1 >= y1) continue;
      if (isCodaShape(component, image.width, width, height)) {
        marks.push({ kind: "coda", x: (component.x0 + component.x1) / 2, system: index });
      } else if (holeCount(component, image.width) <= SEGNO_MAX_HOLES && hasSegnoDots(components, component, spacing)) {
        marks.push({ kind: "segno", x: (component.x0 + component.x1) / 2, system: index });
      }
    }
  });
  return marks;
}

function hasSegnoDots(components: readonly Component[], body: Component, spacing: number): boolean {
  const bodyWidth = body.x1 - body.x0 + 1;
  const bodyHeight = body.y1 - body.y0 + 1;
  const ratio = bodyHeight / bodyWidth;
  if (ratio < SEGNO_MIN_TALLNESS || ratio > SEGNO_MAX_TALLNESS) return false;
  const reach = spacing * 0.5;
  const dots = components.filter((other) => {
    if (other === body) return false;
    const width = other.x1 - other.x0 + 1;
    const height = other.y1 - other.y0 + 1;
    if (width > spacing * 0.6 || height > spacing * 0.6 || other.pixels < 3) return false;
    if (Math.max(width, height) > Math.min(width, height) * 1.6) return false;
    return other.x0 >= body.x0 - reach && other.x1 <= body.x1 + reach && other.y0 >= body.y0 && other.y1 <= body.y1;
  });
  const middle = (body.x0 + body.x1) / 2;
  const left = dots.filter((dot) => dot.x1 < middle);
  const right = dots.filter((dot) => dot.x0 > middle);
  if (left.length !== 1 || right.length !== 1) return false;
  const leftY = ((left[0]?.y0 ?? 0) + (left[0]?.y1 ?? 0)) / 2;
  const rightY = ((right[0]?.y0 ?? 0) + (right[0]?.y1 ?? 0)) / 2;
  return Math.abs(leftY - rightY) >= bodyHeight * SEGNO_DOT_OFFSET;
}
