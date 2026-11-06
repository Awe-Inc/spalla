import { describe, expect, it } from "vitest";

import { performancePath } from "./performancePath";
import type { InkImage } from "./raster";
import { analyzePage, assembleStructure, isReadingFinal, type ScoreMeasure } from "./structure";
import type { PageText } from "./marks";

const WIDTH = 1600;
const HEIGHT = 2000;
const SPACING = 14;
const LEFT = 120;
const RIGHT = 1480;
const STAFF_GAP = 320;
const FIRST_STAFF_TOP = 300;
const THIN = 2;
const THICK = 7;

interface Canvas {
  readonly ink: Uint8Array;
  rect(x: number, y: number, width: number, height: number): void;
  disc(cx: number, cy: number, radius: number): void;
}

function canvas(): Canvas {
  const ink = new Uint8Array(WIDTH * HEIGHT);
  const rect = (x: number, y: number, width: number, height: number) => {
    for (let row = Math.round(y); row < Math.round(y + height); row += 1) {
      for (let column = Math.round(x); column < Math.round(x + width); column += 1) ink[row * WIDTH + column] = 1;
    }
  };
  const disc = (cx: number, cy: number, radius: number) => {
    for (let row = -radius; row <= radius; row += 1) {
      for (let column = -radius; column <= radius; column += 1) {
        if (row * row + column * column <= radius * radius) ink[Math.round(cy + row) * WIDTH + Math.round(cx + column)] = 1;
      }
    }
  };
  return { ink, rect, disc };
}

function staffTop(system: number): number {
  return FIRST_STAFF_TOP + system * STAFF_GAP;
}

function drawStaff(paper: Canvas, system: number, right = RIGHT): void {
  for (let line = 0; line < 5; line += 1) paper.rect(LEFT, staffTop(system) + line * SPACING, right - LEFT, THIN);
  paper.rect(LEFT, staffTop(system), THIN, SPACING * 4 + THIN);
}

function drawBar(paper: Canvas, system: number, x: number): void {
  paper.rect(x, staffTop(system), THIN, SPACING * 4 + THIN);
}

function drawRepeatEnd(paper: Canvas, system: number, x: number): void {
  const top = staffTop(system);
  paper.disc(x - 14, top + SPACING * 1.5, 3);
  paper.disc(x - 14, top + SPACING * 2.5, 3);
  paper.rect(x - 8, top, THIN, SPACING * 4 + THIN);
  paper.rect(x - 2, top, THICK, SPACING * 4 + THIN);
}

function drawRepeatStart(paper: Canvas, system: number, x: number): void {
  const top = staffTop(system);
  paper.rect(x, top, THICK, SPACING * 4 + THIN);
  paper.rect(x + THICK + 4, top, THIN, SPACING * 4 + THIN);
  paper.disc(x + THICK + 12, top + SPACING * 1.5, 3);
  paper.disc(x + THICK + 12, top + SPACING * 2.5, 3);
}

function drawVolta(paper: Canvas, system: number, x0: number, x1: number): void {
  const y = staffTop(system) - SPACING * 3;
  paper.rect(x0, y, x1 - x0, THIN);
  paper.rect(x0, y, THIN, SPACING * 2);
}

function drawNotes(paper: Canvas, system: number, x0: number, x1: number): void {
  for (let x = x0 + 60; x < x1 - 40; x += 90) {
    paper.disc(x, staffTop(system) + SPACING * 2, 6);
    paper.rect(x + 5, staffTop(system) - SPACING, THIN, SPACING * 3);
  }
}

function image(paper: Canvas): InkImage {
  return { width: WIDTH, height: HEIGHT, ink: paper.ink };
}

function word(text: string, system: number, x: number): PageText {
  return { text, x, y: staffTop(system) + SPACING * 7, width: text.length * 12, height: 20 };
}

function fourBarSystem(paper: Canvas, system: number): number[] {
  drawStaff(paper, system);
  const bars = [460, 800, 1140, RIGHT - THIN];
  let from = LEFT;
  for (const bar of bars) {
    drawNotes(paper, system, from, bar);
    drawBar(paper, system, bar);
    from = bar;
  }
  return bars;
}

describe("leitura da página", () => {
  it("acha sistemas e compassos em ordem", () => {
    const paper = canvas();
    fourBarSystem(paper, 0);
    fourBarSystem(paper, 1);
    const measures = analyzePage(image(paper), [], 0);
    expect(measures).toHaveLength(8);
    expect(measures.map((measure) => measure.system)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(measures[1]?.x0).toBeCloseTo(460 / WIDTH, 2);
    expect(measures[0]?.top).toBeLessThan(measures[4]?.top ?? 0);
  });

  it("conta o sistema final mais curto que a página", () => {
    const paper = canvas();
    fourBarSystem(paper, 0);
    drawStaff(paper, 1, 700);
    drawNotes(paper, 1, LEFT, 400);
    drawBar(paper, 1, 400);
    drawNotes(paper, 1, 400, 698);
    drawBar(paper, 1, 698);
    expect(analyzePage(image(paper), [], 0)).toHaveLength(6);
  });

  it("reconhece barras de repetição e o percurso sai certo", () => {
    const paper = canvas();
    drawStaff(paper, 0);
    drawNotes(paper, 0, LEFT, 460);
    drawBar(paper, 0, 460);
    drawRepeatStart(paper, 0, 800);
    drawNotes(paper, 0, 460, 800);
    drawNotes(paper, 0, 830, 1140);
    drawRepeatEnd(paper, 0, 1140);
    drawNotes(paper, 0, 1140, RIGHT - THIN);
    drawBar(paper, 0, RIGHT - THIN);
    const measures = analyzePage(image(paper), [], 0);
    expect(measures).toHaveLength(4);
    expect(measures[2]?.repeatStart).toBe(true);
    expect(measures[2]?.repeatEnd).toBe(true);
    expect(performancePath(assembleStructure([measures], false).measures)).toEqual([0, 1, 2, 2, 3]);
  });

  it("lê D.S., To Coda, Fine e D.C. da camada de texto", () => {
    const paper = canvas();
    fourBarSystem(paper, 0);
    const measures = analyzePage(image(paper), [word("Fine", 0, 600), word("D.S. al Coda", 0, 1300)], 0);
    expect(measures[1]?.fine).toBe(true);
    expect(measures[3]?.dalSegno).toBe(true);
    expect(measures.filter((measure) => measure.daCapo)).toHaveLength(0);
  });

  it("palavra de expressão não vira salto", () => {
    const paper = canvas();
    fourBarSystem(paper, 0);
    const measures = analyzePage(image(paper), [word("dolce", 0, 600), word("rit.", 0, 900)], 0);
    expect(measures.some((measure) => measure.fine || measure.daCapo || measure.dalSegno || measure.toCoda)).toBe(false);
  });

  it("colchete de casa com número escrito vira a casa", () => {
    const paper = canvas();
    fourBarSystem(paper, 0);
    drawVolta(paper, 0, 804, 1136);
    drawVolta(paper, 0, 1144, RIGHT - 8);
    const texts: PageText[] = [
      { text: "1.", x: 816, y: staffTop(0) - SPACING * 1.5, width: 14, height: 16 },
      { text: "2.", x: 1156, y: staffTop(0) - SPACING * 1.5, width: 14, height: 16 },
    ];
    const measures = analyzePage(image(paper), texts, 0);
    expect(measures[2]?.endings).toEqual([1]);
    expect(measures[3]?.endings).toEqual([2]);
    expect(measures[0]?.endings).toBeUndefined();
  });

  it("página sem pauta não inventa compasso", () => {
    const paper = canvas();
    paper.rect(200, 200, 600, 40);
    paper.disc(800, 900, 80);
    expect(analyzePage(image(paper), [], 0)).toEqual([]);
  });

  it("numera páginas e casas sem número em sequência", () => {
    const page = { x0: 0, x1: 0.2, top: 0.1, bottom: 0.2, system: 0 };
    const { measures, hasTextLayer } = assembleStructure([[{ ...page, page: 0, endings: [0], repeatEnd: true }], [{ ...page, page: 1, endings: [0] }]], true);
    expect(hasTextLayer).toBe(true);
    expect(measures.map((measure) => measure.endings)).toEqual([[1], [2]]);
  });

  it("duas codas sem aviso de To Coda: sai na primeira e chega na última", () => {
    const page = { x0: 0, x1: 0.2, top: 0.1, bottom: 0.2, system: 0, page: 0 };
    const { measures } = assembleStructure([[{ ...page, coda: true }, { ...page, daCapo: true }, { ...page, coda: true }]], true);
    expect(measures[0]?.toCoda).toBe(true);
    expect(measures[0]?.coda).toBeUndefined();
    expect(measures[2]?.coda).toBe(true);
  });
});

describe("isReadingFinal", () => {
  const measures = [{ page: 0 } as ScoreMeasure];

  it("scan cujo OCR não rodou fica para ler de novo", () => {
    expect(isReadingFinal({ measures, hasTextLayer: false })).toBe(false);
  });

  it("guarda quando o OCR rodou ou quando o PDF tem texto", () => {
    expect(isReadingFinal({ measures, hasTextLayer: false, ocrRead: true })).toBe(true);
    expect(isReadingFinal({ measures, hasTextLayer: true })).toBe(true);
  });

  it("página sem pauta não tem o que reler", () => {
    expect(isReadingFinal({ measures: [], hasTextLayer: false })).toBe(true);
  });
});
