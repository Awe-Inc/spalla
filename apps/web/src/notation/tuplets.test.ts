import type { Score, ScoreEvent } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { buildGeometry, layoutBeam } from "./staffLayout";
import { findTuplets, isTripletValue, layoutTuplet } from "./tuplets";

const SECONDS_PER_QUARTER = 0.5;

function notes(lengths: number[], noteName = "A4"): ScoreEvent[] {
  let quarters = 0;
  return lengths.map((length) => {
    const isRest = length < 0;
    const value = Math.abs(length);
    const item: ScoreEvent = {
      startSeconds: quarters * SECONDS_PER_QUARTER,
      durationSeconds: value * SECONDS_PER_QUARTER,
      startQuarters: quarters,
      frequencyHz: 440, midi: 69, measure: 1, measureIndex: 0, beat: 1, isRest, isTiedFrom: false, string: 2,
      bowSpan: 1, bowSlot: 0, marks: "", dynamic: "", isGrace: false, graceSlashed: false, chordMidi: [], chordNames: [],
      noteName, latinName: "Lá4",
    };
    quarters += value;
    return item;
  });
}

function score(events: ScoreEvent[], beamGroups: Score["beamGroups"] = []): Score {
  return {
    title: "Teste", composer: "", partName: "", beatsPerMinute: 120, beatsPerMeasure: 4, beatUnit: 4, keyFifths: 0,
    durationSeconds: 0, noteCount: events.length, trimmedIntroSeconds: 0, tempoScale: 1,
    events, measures: [], beamGroups, expressions: [],
  };
}

const THIRD = 1 / 3;
const SIXTH = 1 / 6;

describe("isTripletValue", () => {
  it("reconhece colcheia, semicolcheia e semínima de tercina", () => {
    expect(isTripletValue(THIRD)).toBe(true);
    expect(isTripletValue(SIXTH)).toBe(true);
    expect(isTripletValue(2 / 3)).toBe(true);
  });

  it("não confunde figura simples nem pontuada com tercina", () => {
    for (const quarters of [1, 0.5, 0.25, 0.75, 0.375, 1.5, 2]) expect(isTripletValue(quarters)).toBe(false);
  });
});

describe("findTuplets", () => {
  it("fecha uma tercina por tempo, com o número 3", () => {
    const spans = findTuplets(score(notes([THIRD, THIRD, THIRD, THIRD, THIRD, THIRD])));
    expect(spans).toEqual([
      { first: 0, last: 2, label: "3" },
      { first: 3, last: 5, label: "3" },
    ]);
  });

  it("seis semicolcheias de tercina num tempo levam o número 6", () => {
    expect(findTuplets(score(notes(Array(6).fill(SIXTH))))).toEqual([{ first: 0, last: 5, label: "6" }]);
  });

  it("semínimas de tercina ocupam duas semínimas", () => {
    expect(findTuplets(score(notes([2 / 3, 2 / 3, 2 / 3, 1, 1])))).toEqual([{ first: 0, last: 2, label: "3" }]);
  });

  it("longa e curta dentro da tercina ainda é 3", () => {
    expect(findTuplets(score(notes([2 / 3, THIRD, 1])))).toEqual([{ first: 0, last: 1, label: "3" }]);
  });

  it("conta a pausa dentro da tercina", () => {
    expect(findTuplets(score(notes([THIRD, -THIRD, THIRD])))).toEqual([{ first: 0, last: 2, label: "3" }]);
  });

  it("colcheias e semicolcheias comuns não viram tercina", () => {
    expect(findTuplets(score(notes([0.5, 0.5, 0.25, 0.25, 0.25, 0.25, 0.75, 0.25])))).toEqual([]);
  });

  it("tercina incompleta não ganha número", () => {
    expect(findTuplets(score(notes([THIRD, THIRD, 1])))).toEqual([]);
  });
});

describe("layoutTuplet", () => {
  const geometry = buildGeometry(1000, 200, 0);

  it("com feixe, o número fica do lado de fora do feixe e sem colchete", () => {
    const low = score(notes([THIRD, THIRD, THIRD], "G4"), [{ first: 0, last: 2 }]);
    const [span] = findTuplets(low);
    if (!span) throw new Error("sem tercina");
    const group = low.beamGroups[0];
    if (!group) throw new Error("sem feixe");
    const beam = layoutBeam(low, group, geometry);
    const mark = layoutTuplet(low, span, geometry, beam);
    expect(mark.bracket).toBe(false);
    expect(beam.stemUp).toBe(true);
    expect(mark.y).toBeLessThan(beam.y0);
  });

  it("sem feixe, ganha colchete acima das hastes que sobem", () => {
    const quarters = score(notes([2 / 3, 2 / 3, 2 / 3], "G4"));
    const [span] = findTuplets(quarters);
    if (!span) throw new Error("sem tercina");
    const mark = layoutTuplet(quarters, span, geometry, null);
    expect(mark.bracket).toBe(true);
    expect(mark.above).toBe(true);
    expect(mark.y).toBeLessThan(geometry.staffTop);
    expect(mark.x1).toBeGreaterThan(mark.x0);
  });

  it("notas agudas sem feixe põem o colchete embaixo", () => {
    const high = score(notes([2 / 3, 2 / 3, 2 / 3], "E5"));
    const [span] = findTuplets(high);
    if (!span) throw new Error("sem tercina");
    const mark = layoutTuplet(high, span, geometry, null);
    expect(mark.above).toBe(false);
    expect(mark.y).toBeGreaterThan(geometry.bottomY);
  });
});
