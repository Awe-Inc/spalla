import { describe, expect, it } from "vitest";

import { readNote, timedMeasure } from "./omrFixtures";
import type { ScoreMeasure, ScoreStructure } from "./structure";
import { withReadTiming } from "./timing";

const MEASURE: ScoreMeasure = { page: 0, system: 0, x0: 0, x1: 1, top: 0, bottom: 1 };
const STRUCTURE: ScoreStructure = { measures: [MEASURE, MEASURE], hasTextLayer: true };

describe("tempo lido na estrutura", () => {
  it("carimba tempos por compasso, anacruse e compasso do corpo da peça", () => {
    const timed = [timedMeasure([readNote()], { isPickup: true, quarters: 1, numerator: 3 }), timedMeasure([readNote()], { quarters: 3, numerator: 3 })];
    const result = withReadTiming(STRUCTURE, timed, 96);
    expect(result.bpm).toBe(96);
    expect(result.hasPickup).toBe(true);
    expect(result.meter).toEqual({ numerator: 3, denominator: 4 });
    expect(result.measures.map((measure) => measure.quarters)).toEqual([1, 3]);
  });

  it("sem andamento escrito, não preenche bpm", () => {
    expect(withReadTiming(STRUCTURE, [], null)).toEqual(STRUCTURE);
  });

  it("se a leitura não bate em número de compassos, não carimba tempo nenhum", () => {
    const result = withReadTiming(STRUCTURE, [timedMeasure([readNote()])], 80);
    expect(result).toEqual({ ...STRUCTURE, bpm: 80 });
  });
});
