import { describe, expect, it } from "vitest";

import { blankSketch, paintBox, paintHead, paintStaff, paintStem, paintWholeNote } from "./omrFixtures";
import { leveledPage } from "./pageLeveling";
import type { InkImage } from "./raster";
import { readMeasureNotes, withPitches } from "./readMeasure";
import { withoutStaffLines } from "./staffCleaning";
import { findStaves } from "./staves";

const SPACING = 20;
const STAFF_TOP = 200;
const STAFF_BOTTOM = STAFF_TOP + 4 * SPACING;
const WIDTH = 1200;

function page(): InkImage {
  const sketch = blankSketch(WIDTH, 500);
  paintStaff(sketch, STAFF_TOP, SPACING);
  return sketch;
}

function yOf(position: number): number {
  return STAFF_BOTTOM - (position * SPACING) / 2;
}

function read(sketch: InkImage) {
  const image = leveledPage(sketch);
  const staves = findStaves(image);
  const staff = staves[0];
  if (!staff) throw new Error("pauta não encontrada");
  return withPitches(readMeasureNotes(image, withoutStaffLines(image, staves), staff, 100, 1100), 0);
}

describe("leitura de notas numa pauta desenhada", () => {
  it("lê semínimas com a altura certa", () => {
    const sketch = page();
    [0, 2, 4, 6].forEach((position, index) => {
      const x = 200 + index * 200;
      paintHead(sketch, x, yOf(position), SPACING);
      paintStem(sketch, x, yOf(position), SPACING);
    });
    const notes = read(sketch);
    expect(notes.map((note) => note.midi)).toEqual([[64], [67], [71], [74]]);
    expect(notes.map((note) => note.quarters)).toEqual([1, 1, 1, 1]);
  });

  it("lê mínima pela cabeça vazada", () => {
    const sketch = page();
    paintHead(sketch, 300, yOf(2), SPACING, true);
    paintStem(sketch, 300, yOf(2), SPACING);
    expect(read(sketch).map((note) => note.quarters)).toEqual([2]);
  });

  it("lê semibreve sem haste", () => {
    const sketch = page();
    paintWholeNote(sketch, 400, yOf(3), SPACING);
    const notes = read(sketch);
    expect(notes.map((note) => note.quarters)).toEqual([4]);
    expect(notes[0]?.midi).toEqual([69]);
  });

  it("colcheias com barra de ligação ficam ligadas e valem meio tempo", () => {
    const sketch = page();
    const [left, right] = [300, 420];
    paintHead(sketch, left, yOf(3), SPACING);
    paintHead(sketch, right, yOf(3), SPACING);
    const leftStem = paintStem(sketch, left, yOf(3), SPACING);
    const rightStem = paintStem(sketch, right, yOf(3), SPACING);
    const stemTop = Math.round(yOf(3) - SPACING * 3.5);
    paintBox(sketch, leftStem, stemTop, rightStem + 1, stemTop + Math.round(SPACING * 0.5));
    const notes = read(sketch);
    expect(notes.map((note) => note.quarters)).toEqual([0.5, 0.5]);
    expect(notes[0]?.beamedToNext).toBe(true);
    expect(notes[1]?.beamedToNext).toBe(false);
  });
});

describe("pauta curva de scan", () => {
  it("o nivelamento devolve uma pauta só, reta", () => {
    const sketch = blankSketch(WIDTH, 500);
    paintStaff(sketch, STAFF_TOP, SPACING, (x) => SPACING * 1.2 * Math.sin((x / WIDTH) * Math.PI));
    const staves = findStaves(leveledPage(sketch));
    expect(staves).toHaveLength(1);
    expect(staves[0]?.spacing).toBeCloseTo(SPACING, 0);
  });
});
