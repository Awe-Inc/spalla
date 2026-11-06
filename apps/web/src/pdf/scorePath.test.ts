import { describe, expect, it } from "vitest";

import type { PageStack } from "./autoScroll";
import type { ScoreMeasure } from "./omr/structure";
import { buildTimeline, commonBeatsOf, currentMeasure, pathRanges, progressAfterMeasures, progressAtReadingY, readingYAt, totalBeatsOf, upcomingNotice } from "./scorePath";

const STACK: PageStack = { tops: [0, 1100], heights: [1000, 1000], contentHeight: 2100 };
const WIDTH = 800;

function measure(system: number, slot: number, marks: Partial<ScoreMeasure> = {}, page = 0): ScoreMeasure {
  return { page, system, x0: 0.1 + slot * 0.2, x1: 0.3 + slot * 0.2, top: 0.1 + system * 0.2, bottom: 0.2 + system * 0.2, ...marks };
}

function twoSystems(marksOfLast: Partial<ScoreMeasure>): ScoreMeasure[] {
  return [measure(0, 0), measure(0, 1), measure(1, 0), measure(1, 1, marksOfLast)];
}

describe("posição dentro do percurso", () => {
  it("anda dentro do sistema e chega no próximo sem degrau", () => {
    const timeline = buildTimeline(twoSystems({}), STACK, WIDTH);
    expect(readingYAt(timeline, 0, 4)).toBeCloseTo(100);
    expect(readingYAt(timeline, 0.25, 4)).toBeCloseTo(200);
    expect(readingYAt(timeline, 0.4999, 4)).toBeCloseTo(300, 0);
    expect(readingYAt(timeline, 0.5, 4)).toBeCloseTo(300);
  });

  it("segue até a página seguinte", () => {
    const timeline = buildTimeline([measure(0, 0), measure(0, 0, {}, 1)], STACK, WIDTH);
    expect(readingYAt(timeline, 0.5, 4)).toBeCloseTo(1200);
  });

  it("na repetição, volta suave no último tempo e não antes", () => {
    const timeline = buildTimeline(twoSystems({ repeatEnd: true }), STACK, WIDTH);
    expect(timeline.order).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    const startOfGlide = (3 + 0.75) / 8;
    const beforeGlide = readingYAt(timeline, startOfGlide - 0.001, 4);
    expect(beforeGlide).toBeGreaterThan(300);
    expect(readingYAt(timeline, startOfGlide + 0.5 / 8 / 4, 4)).toBeLessThan(beforeGlide);
    expect(readingYAt(timeline, 4 / 8 - 1e-6, 4)).toBeCloseTo(100, 0);
    expect(readingYAt(timeline, 4 / 8, 4)).toBeCloseTo(100);
  });

  it("nunca dá um degrau grande entre um quadro e o seguinte", () => {
    const timeline = buildTimeline(twoSystems({ repeatEnd: true }), STACK, WIDTH);
    let previous = readingYAt(timeline, 0, 4);
    for (let frame = 1; frame <= 800; frame += 1) {
      const y = readingYAt(timeline, frame / 800, 4);
      expect(Math.abs(y - previous)).toBeLessThan(20);
      previous = y;
    }
  });

  it("marca o compasso certo em cada passagem", () => {
    const timeline = buildTimeline(twoSystems({ repeatEnd: true }), STACK, WIDTH);
    expect(currentMeasure(timeline, 0)).toBe(0);
    expect(currentMeasure(timeline, 5.5 / 8)).toBe(1);
    expect(currentMeasure(timeline, 1)).toBe(3);
  });
});

describe("reposicionar com o dedo", () => {
  it("cai na próxima passagem por aquele compasso, não na primeira", () => {
    const timeline = buildTimeline(twoSystems({ repeatEnd: true }), STACK, WIDTH);
    const y = readingYAt(timeline, 0.5 / 8, 4);
    expect(progressAtReadingY(timeline, y, 0)).toBeCloseTo(0.5 / 8);
    expect(progressAtReadingY(timeline, y, 3.5 / 8)).toBeCloseTo(4.5 / 8);
  });

  it("depois da última passagem, volta para a primeira", () => {
    const timeline = buildTimeline(twoSystems({ repeatEnd: true }), STACK, WIDTH);
    const y = readingYAt(timeline, 0.5 / 8, 4);
    expect(progressAtReadingY(timeline, y, 7.5 / 8)).toBeCloseTo(0.5 / 8);
  });

  it("acima do primeiro sistema é o começo; abaixo do último é o fim", () => {
    const timeline = buildTimeline(twoSystems({}), STACK, WIDTH);
    expect(progressAtReadingY(timeline, 10, 0.5)).toBe(0);
    expect(progressAtReadingY(timeline, 2000, 0)).toBe(1);
  });
});

describe("aviso antes do salto", () => {
  it("avisa um compasso antes, diz o motivo e o destino", () => {
    const measures = [measure(0, 0, { segno: true }), measure(0, 1), measure(0, 2), measure(1, 0, { dalSegno: true }), measure(1, 1)];
    const timeline = buildTimeline(measures, STACK, WIDTH);
    expect(timeline.order).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 4]);
    expect(upcomingNotice(timeline, 0.5 / 9)).toBeNull();
    expect(upcomingNotice(timeline, 2.5 / 9)).toEqual({ text: "D.S.: volta ao compasso 1", target: 0 });
    expect(upcomingNotice(timeline, 3.5 / 9)).toEqual({ text: "D.S.: volta ao compasso 1", target: 0 });
    expect(upcomingNotice(timeline, 4.5 / 9)).toBeNull();
  });

  it("avisa o salto para a coda", () => {
    const measures = [measure(0, 0, { toCoda: true }), measure(0, 1, { daCapo: true }), measure(1, 0, { coda: true })];
    const timeline = buildTimeline(measures, STACK, WIDTH);
    expect(timeline.order).toEqual([0, 1, 0, 2]);
    expect(upcomingNotice(timeline, 2.5 / 4)?.text).toBe("Coda: salta para o compasso 3");
  });

  it("avisa quando a música termina no Fine, no meio da página", () => {
    const measures = [measure(0, 0), measure(0, 1, { fine: true }), measure(1, 0, { daCapo: true })];
    const timeline = buildTimeline(measures, STACK, WIDTH);
    expect(timeline.order).toEqual([0, 1, 2, 0, 1]);
    expect(upcomingNotice(timeline, 4.5 / 5)).toEqual({ text: "Fine: termina no compasso 2", target: null });
  });

  it("não avisa nada quando a peça termina no último compasso", () => {
    const timeline = buildTimeline(twoSystems({}), STACK, WIDTH);
    expect(upcomingNotice(timeline, 3.5 / 4)).toBeNull();
  });
});

describe("percurso escrito para conferir", () => {
  it("agrupa o que é seguido", () => {
    expect(pathRanges([0, 1, 2, 3, 0, 1, 4])).toBe("1–4, 1–2, 5");
  });
});

describe("tempo lido por compasso", () => {
  const weighted = (first: number, rest: number) => [measure(0, 0, { quarters: first }), measure(0, 1, { quarters: rest }), measure(1, 0, { quarters: rest })];

  it("sem tempos lidos, todos os compassos pesam igual", () => {
    const timeline = buildTimeline(twoSystems({}), STACK, WIDTH);
    expect(timeline.starts).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(totalBeatsOf(timeline)).toBeNull();
    expect(commonBeatsOf(timeline)).toBeNull();
  });

  it("anacruse pesa só o que dura", () => {
    const timeline = buildTimeline(weighted(1, 4), STACK, WIDTH);
    expect(timeline.starts).toEqual([0, 1 / 9, 5 / 9, 1]);
    expect(totalBeatsOf(timeline)).toBe(9);
    expect(commonBeatsOf(timeline)).toBe(4);
    expect(currentMeasure(timeline, 0.05)).toBe(0);
    expect(currentMeasure(timeline, 0.12)).toBe(1);
  });

  it("repetição soma os tempos tocados de novo", () => {
    const timeline = buildTimeline([measure(0, 0, { quarters: 3 }), measure(0, 1, { quarters: 3, repeatEnd: true })], STACK, WIDTH);
    expect(totalBeatsOf(timeline)).toBe(12);
  });

  it("andar por compasso respeita o tamanho de cada um", () => {
    const timeline = buildTimeline(weighted(1, 4), STACK, WIDTH);
    expect(progressAfterMeasures(timeline, 1 / 9, -1)).toBeCloseTo(0);
    expect(progressAfterMeasures(timeline, 0, 1)).toBeCloseTo(1 / 9);
    expect(progressAfterMeasures(timeline, 0.2, -5)).toBe(0);
    expect(progressAfterMeasures(timeline, 0.2, 5)).toBe(1);
  });
});
