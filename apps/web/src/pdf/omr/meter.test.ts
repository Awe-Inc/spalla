import { describe, expect, it } from "vitest";

import { inferMeter, withTriplets } from "./meter";
import { readNote, timedMeasure } from "./omrFixtures";
import type { ReadNote } from "./readMeasure";

function read(...sums: ReadonlyArray<readonly number[]>) {
  return sums.map((durations) => timedMeasure(durations.map((quarters) => readNote({ quarters }))));
}

const FOUR = [1, 1, 1, 1];

describe("compasso deduzido das durações", () => {
  it("acha o compasso mais comum", () => {
    const [first] = inferMeter(read(FOUR, FOUR, FOUR));
    expect(first).toMatchObject({ numerator: 4, denominator: 4, quarters: 4, addsUp: true, isPickup: false });
  });

  it("reconhece a anacruse quando o primeiro e o último compasso somam um inteiro", () => {
    const timed = inferMeter(read([1], FOUR, FOUR, FOUR, [1, 1, 1]));
    expect(timed[0]).toMatchObject({ isPickup: true, quarters: 1, addsUp: true });
    expect(timed.at(-1)).toMatchObject({ quarters: 3, addsUp: true });
  });

  it("marca o compasso que não fecha e conta o tempo do compasso cheio", () => {
    const timed = inferMeter(read(FOUR, [1, 1, 1], FOUR, FOUR, FOUR));
    expect(timed[1]).toMatchObject({ addsUp: false, quarters: 4 });
  });

  it("pausa do compasso inteiro em 3/4 leva ponto para o tipo bater com a duração", () => {
    const threeFour = [readNote({ quarters: 1 }), readNote({ quarters: 1 }), readNote({ quarters: 1 })];
    const measures = [threeFour, [], threeFour, threeFour].map((notes, index) => ({ ...timedMeasure(notes), index }));
    const timed = inferMeter(measures);
    expect(timed[1]?.notes[0]).toMatchObject({ isRest: true, quarters: 3, dots: 1 });
  });

  it("compasso vazio vira pausa do compasso inteiro e pede conferência", () => {
    const timed = inferMeter(read(FOUR, [], FOUR, FOUR));
    expect(timed[1]).toMatchObject({ addsUp: false, quarters: 4 });
    expect(timed[1]?.notes[0]).toMatchObject({ isRest: true, quarters: 4 });
  });

  it("acha mudança de compasso que dura vários compassos", () => {
    const three = [1, 1, 1];
    const timed = inferMeter(read(FOUR, FOUR, FOUR, FOUR, three, three, three, three));
    expect(timed[0]?.numerator).toBe(4);
    expect(timed[5]?.numerator).toBe(3);
    expect(timed[5]?.addsUp).toBe(true);
  });
});

describe("tercinas", () => {
  const eighth = (beamedToNext: boolean): ReadNote => readNote({ quarters: 0.5, beamedToNext });

  it("converte grupo de três colcheias ligadas quando o compasso passa da conta", () => {
    const notes = [readNote(), readNote(), readNote(), eighth(true), eighth(true), eighth(false)];
    const fixed = withTriplets(notes, 4);
    expect(fixed.slice(3).every((note) => note.triplet)).toBe(true);
    expect(fixed.reduce((sum, note) => sum + note.quarters, 0)).toBeCloseTo(4);
  });

  it("deixa como está quando a conta já fecha", () => {
    const notes = [readNote(), readNote(), eighth(true), eighth(false), readNote()];
    expect(withTriplets(notes, 4)).toBe(notes);
  });
});
