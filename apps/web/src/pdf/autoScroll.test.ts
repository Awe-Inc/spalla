import { describe, expect, it } from "vitest";

import {
  advanceProgress,
  bumpBpm,
  formatPieceDuration,
  isPlanReady,
  keyToRollAction,
  leadInSeconds,
  nudgeProgress,
  pageAtY,
  pieceSeconds,
  progressAtScrollTop,
  scrollTopAt,
  stackPages,
  type ScrollPlan,
} from "./autoScroll";

const PLAN: ScrollPlan = { measures: 40, beatsPerMeasure: 3, bpm: 120 };
const VIEW = 600;
const CONTENT = 6000;

function secondsToFinish(plan: ScrollPlan): number {
  let progress = 0;
  let elapsed = 0;
  while (progress < 1) {
    progress = advanceProgress(progress, 0.05, plan);
    elapsed += 0.05;
  }
  return elapsed;
}

describe("velocidade", () => {
  it("calcula a duração pelos compassos, tempos e andamento", () => {
    expect(pieceSeconds(PLAN)).toBe(60);
    expect(formatPieceDuration(pieceSeconds({ ...PLAN, bpm: 60 }))).toBe("2:00");
  });

  it("chega ao fim da peça no tempo da música, rápida ou lenta", () => {
    expect(secondsToFinish(PLAN)).toBeCloseTo(60, 0);
    expect(secondsToFinish({ ...PLAN, bpm: 240 })).toBeCloseTo(30, 0);
  });

  it("dá ao músico tempo de levar a mão ao arco antes de rolar, mesmo em andamento rápido", () => {
    expect(leadInSeconds({ ...PLAN, bpm: 240 })).toBe(4);
    expect(leadInSeconds({ measures: 1, beatsPerMeasure: 4, bpm: 40 })).toBe(6);
  });

  it("só calcula depois de saber quantos compassos a peça tem", () => {
    expect(isPlanReady({ ...PLAN, measures: 0 })).toBe(false);
    expect(isPlanReady(PLAN)).toBe(true);
  });

  it("mudar o andamento não ultrapassa os limites", () => {
    expect(bumpBpm({ ...PLAN, bpm: 300 }, 2).bpm).toBe(300);
    expect(bumpBpm({ ...PLAN, bpm: 20 }, -2).bpm).toBe(20);
  });
});

describe("posição na tela", () => {
  it("só começa a rolar quando a leitura passa do primeiro terço da tela", () => {
    expect(scrollTopAt(0, VIEW, CONTENT)).toBe(0);
    expect(scrollTopAt(200 / CONTENT, VIEW, CONTENT)).toBe(0);
    expect(scrollTopAt(300 / CONTENT, VIEW, CONTENT)).toBe(100);
  });

  it("começa bem antes do fim da tela e deixa o que vem a seguir visível", () => {
    const readingOnScreen = 1000 - scrollTopAt(1000 / CONTENT, VIEW, CONTENT);
    expect(readingOnScreen).toBe(200);
  });

  it("para no fim da partitura sem passar dela", () => {
    expect(scrollTopAt(1, VIEW, CONTENT)).toBe(CONTENT - VIEW);
  });

  it("não rola quando a partitura cabe na tela", () => {
    expect(scrollTopAt(1, 600, 400)).toBe(0);
  });

  it("rolar com a mão reposiciona a leitura sem salto", () => {
    const progress = progressAtScrollTop(1500, VIEW, CONTENT);
    expect(scrollTopAt(progress, VIEW, CONTENT)).toBeCloseTo(1500);
    expect(progressAtScrollTop(0, VIEW, CONTENT)).toBe(0);
  });

  it("avança ou volta um compasso sem sair da peça", () => {
    expect(nudgeProgress(0.5, 1, PLAN)).toBeCloseTo(0.525);
    expect(nudgeProgress(0, -1, PLAN)).toBe(0);
    expect(nudgeProgress(1, 1, PLAN)).toBe(1);
  });
});

describe("páginas empilhadas", () => {
  const stack = stackPages(
    [
      { width: 100, height: 200 },
      { width: 100, height: 100 },
    ],
    300,
    10,
  );

  it("mantém a proporção de cada página na largura da tela", () => {
    expect(stack.heights).toEqual([600, 300]);
    expect(stack.tops).toEqual([0, 610]);
    expect(stack.contentHeight).toBe(910);
  });

  it("diz em que página está a leitura", () => {
    expect(pageAtY(stack, 0)).toBe(1);
    expect(pageAtY(stack, 609)).toBe(1);
    expect(pageAtY(stack, 610)).toBe(2);
  });
});

describe("teclas e pedal", () => {
  const key = (name: string) => ({ key: name, altKey: false, ctrlKey: false, metaKey: false });

  it("Espaço pausa, setas verticais mudam o andamento, pedal anda um compasso", () => {
    expect(keyToRollAction(key(" "))).toBe("toggle");
    expect(keyToRollAction(key("ArrowUp"))).toBe("faster");
    expect(keyToRollAction(key("ArrowDown"))).toBe("slower");
    expect(keyToRollAction(key("PageDown"))).toBe("forward");
    expect(keyToRollAction(key("PageUp"))).toBe("back");
  });

  it("deixa os atalhos do navegador em paz", () => {
    expect(keyToRollAction({ ...key("ArrowLeft"), altKey: true })).toBeNull();
    expect(keyToRollAction(key("a"))).toBeNull();
  });
});
