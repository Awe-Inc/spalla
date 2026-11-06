import type { TimedMeasure } from "./meter";
import type { InkImage } from "./raster";
import type { ReadNote } from "./readMeasure";

export function readNote(fields: Partial<ReadNote> = {}): ReadNote {
  return { x: 0, isRest: false, midi: [69], positions: [5], writtenAlters: [null], quarters: 1, dots: 0, beamedToNext: false, tiedToNext: false, triplet: false, ...fields };
}

export function timedMeasure(notes: readonly ReadNote[], fields: Partial<TimedMeasure> = {}): TimedMeasure {
  return { page: 0, system: 0, fifths: 0, isTreble: true, notes, quarters: 4, numerator: 4, denominator: 4, isPickup: false, addsUp: true, ...fields };
}

export function blankSketch(width: number, height: number): InkImage {
  return { width, height, ink: new Uint8Array(width * height) };
}

export function paint(sketch: InkImage, x: number, y: number): void {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px >= 0 && py >= 0 && px < sketch.width && py < sketch.height) sketch.ink[py * sketch.width + px] = 1;
}

export function paintBox(sketch: InkImage, left: number, top: number, right: number, bottom: number): void {
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) paint(sketch, x, y);
}

export function paintStaff(sketch: InkImage, top: number, spacing: number, curve: (x: number) => number = () => 0): void {
  for (let line = 0; line < 5; line += 1) {
    for (let x = 40; x < sketch.width - 40; x += 1) {
      const y = top + line * spacing + curve(x);
      paint(sketch, x, y);
      paint(sketch, x, y + 1);
    }
  }
}

export function paintHead(sketch: InkImage, x: number, y: number, spacing: number, isHollow = false): void {
  const radiusX = spacing * 0.68;
  const radiusY = spacing * 0.5;
  for (let dy = -radiusY; dy <= radiusY; dy += 1) {
    for (let dx = -radiusX; dx <= radiusX; dx += 1) {
      const distance = (dx / radiusX) ** 2 + (dy / radiusY) ** 2;
      if (distance <= 1 && (!isHollow || distance >= 0.45)) paint(sketch, x + dx, y + dy);
    }
  }
}

export function paintWholeNote(sketch: InkImage, x: number, y: number, spacing: number): void {
  const radiusX = spacing * 0.95;
  const radiusY = spacing * 0.55;
  for (let dy = -radiusY; dy <= radiusY; dy += 1) {
    for (let dx = -radiusX; dx <= radiusX; dx += 1) {
      const distance = (dx / radiusX) ** 2 + (dy / radiusY) ** 2;
      if (distance <= 1 && distance >= 0.35) paint(sketch, x + dx, y + dy);
    }
  }
}

export function paintStem(sketch: InkImage, x: number, y: number, spacing: number): number {
  const stemX = Math.round(x + spacing * 0.6);
  paintBox(sketch, stemX, Math.round(y - spacing * 3.5), stemX + 1, Math.round(y));
  return stemX;
}
