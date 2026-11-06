import { describe, expect, it } from "vitest";

import { canMergeWithNext, mergeWithNext, splitAt, toggleEnding, toggleFlag } from "./corrections";
import { performancePath } from "./performancePath";
import type { ScoreMeasure } from "./structure";

function measure(slot: number, marks: Partial<ScoreMeasure> = {}, system = 0): ScoreMeasure {
  return { page: 0, system, x0: slot * 0.2, x1: (slot + 1) * 0.2, top: 0.1, bottom: 0.2, ...marks };
}

describe("corrigir marcações", () => {
  it("liga e desliga uma marca sem mexer no original", () => {
    const original = [measure(0), measure(1)];
    const marked = toggleFlag(original, 1, "repeatEnd");
    expect(marked[1]?.repeatEnd).toBe(true);
    expect(original[1]?.repeatEnd).toBeUndefined();
    expect(toggleFlag(marked, 1, "repeatEnd")[1]).toEqual(measure(1));
  });

  it("a correção muda o percurso", () => {
    const original = [measure(0), measure(1)];
    expect(performancePath(original)).toEqual([0, 1]);
    expect(performancePath(toggleFlag(original, 1, "repeatEnd"))).toEqual([0, 1, 0, 1]);
  });

  it("liga e desliga as casas", () => {
    const first = toggleEnding([measure(0)], 0, 1);
    expect(first[0]?.endings).toEqual([1]);
    expect(toggleEnding(first, 0, 2)[0]?.endings).toEqual([1, 2]);
    expect(toggleEnding(first, 0, 1)[0]).toEqual(measure(0));
  });

  it("junta uma barra falsa guardando as marcas de cada ponta", () => {
    const merged = mergeWithNext([measure(0, { repeatStart: true, segno: true }), measure(1, { repeatEnd: true, fine: true }), measure(2)], 0);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ x0: 0, x1: 0.4, repeatStart: true, segno: true, repeatEnd: true, fine: true });
  });

  it("não junta compassos de sistemas diferentes", () => {
    const measures = [measure(0), measure(1, {}, 1)];
    expect(canMergeWithNext(measures, 0)).toBe(false);
    expect(mergeWithNext(measures, 0)).toEqual(measures);
  });

  it("divide onde faltou barra e separa as marcas de início e fim", () => {
    const split = splitAt([measure(0, { repeatStart: true, repeatEnd: true })], 0, 0.1);
    expect(split).toHaveLength(2);
    expect(split[0]).toMatchObject({ x0: 0, x1: 0.1, repeatStart: true });
    expect(split[0]?.repeatEnd).toBeUndefined();
    expect(split[1]).toMatchObject({ x0: 0.1, x1: 0.2, repeatEnd: true });
    expect(split[1]?.repeatStart).toBeUndefined();
  });

  it("não divide fora do compasso", () => {
    const measures = [measure(1)];
    expect(splitAt(measures, 0, 0.9)).toEqual(measures);
  });
});
