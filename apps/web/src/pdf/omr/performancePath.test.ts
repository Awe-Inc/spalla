import { describe, expect, it } from "vitest";

import { performancePath } from "./performancePath";
import type { ScoreMeasure } from "./structure";

type Marks = Partial<ScoreMeasure>;

function score(...marks: Marks[]): ScoreMeasure[] {
  return marks.map((mark, index) => ({ page: 0, system: 0, x0: index / 100, x1: (index + 1) / 100, top: 0, bottom: 0.1, ...mark }));
}

describe("percurso da música", () => {
  it("sem marcas, é a ordem escrita", () => {
    expect(performancePath(score({}, {}, {}))).toEqual([0, 1, 2]);
  });

  it("repete do começo quando não há início de repetição", () => {
    expect(performancePath(score({}, { repeatEnd: true }, {}))).toEqual([0, 1, 0, 1, 2]);
  });

  it("repete do início marcado", () => {
    expect(performancePath(score({}, { repeatStart: true }, { repeatEnd: true }, {}))).toEqual([0, 1, 2, 1, 2, 3]);
  });

  it("toca as duas repetições em sequência", () => {
    expect(performancePath(score({ repeatEnd: true }, { repeatStart: true, repeatEnd: true }))).toEqual([0, 0, 1, 1]);
  });

  it("primeira e segunda casa", () => {
    expect(performancePath(score({}, { endings: [1], repeatEnd: true }, { endings: [2] }, {}))).toEqual([0, 1, 0, 2, 3]);
  });

  it("D.C. al Fine para no Fine", () => {
    expect(performancePath(score({}, { fine: true }, {}, { daCapo: true }))).toEqual([0, 1, 2, 3, 0, 1]);
  });

  it("D.S. al Coda sai no To Coda e cai na Coda", () => {
    expect(performancePath(score({}, { segno: true }, { toCoda: true }, { dalSegno: true }, { coda: true }))).toEqual([0, 1, 2, 3, 1, 2, 4]);
  });

  it("depois do salto não repete de novo e toma só a última casa", () => {
    expect(performancePath(score({ repeatStart: true }, { endings: [1], repeatEnd: true }, { endings: [2] }, { daCapo: true }))).toEqual([0, 1, 0, 2, 3, 0, 2, 3]);
  });

  it("D.S. sem segno na partitura segue em frente sem travar", () => {
    expect(performancePath(score({}, { dalSegno: true }, {}))).toEqual([0, 1, 2]);
  });

  it("Fine antes de qualquer salto não encerra", () => {
    expect(performancePath(score({ fine: true }, {}))).toEqual([0, 1]);
  });
});
