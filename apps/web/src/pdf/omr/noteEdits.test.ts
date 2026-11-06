import { describe, expect, it } from "vitest";

import { measuresToReview, shiftedPitch, withDuration, withoutNote } from "./noteEdits";
import { readNote, timedMeasure } from "./omrFixtures";

const OF_THREE_BEATS = timedMeasure([readNote(), readNote(), readNote()], { addsUp: false });

describe("correção das notas lidas", () => {
  it("sobe e desce meio tom sem mudar as outras notas", () => {
    const measure = shiftedPitch(timedMeasure([readNote({ midi: [69] }), readNote({ midi: [71] })]), 1, -1);
    expect(measure.notes.map((note) => note.midi)).toEqual([[69], [70]]);
  });

  it("move as duas notas de uma corda dupla juntas", () => {
    expect(shiftedPitch(timedMeasure([readNote({ midi: [69, 76] })]), 0, 1).notes[0]?.midi).toEqual([70, 77]);
  });

  it("não altera o compasso original", () => {
    shiftedPitch(OF_THREE_BEATS, 0, 1);
    expect(OF_THREE_BEATS.notes[0]?.midi).toEqual([69]);
  });

  it("o compasso passa a fechar quando a duração corrigida completa a conta", () => {
    const fixed = withDuration(OF_THREE_BEATS, 2, 2);
    expect(fixed.addsUp).toBe(true);
    expect(fixed.quarters).toBe(4);
    expect(measuresToReview([fixed, OF_THREE_BEATS])).toEqual([1]);
  });

  it("duração pontuada grava o ponto e tira a tercina", () => {
    const note = withDuration(timedMeasure([readNote({ triplet: true })]), 0, 1.5).notes[0];
    expect(note).toMatchObject({ quarters: 1.5, dots: 1, triplet: false });
  });

  it("tirar nota que sobrava faz o compasso fechar", () => {
    const measure = timedMeasure([readNote(), readNote(), readNote(), readNote(), readNote()], { addsUp: false });
    expect(withoutNote(measure, 4).addsUp).toBe(true);
  });

  it("compasso sem nota nenhuma continua pedindo conferência, mesmo sendo anacruse", () => {
    const pickup = timedMeasure([readNote()], { isPickup: true });
    expect(withoutNote(pickup, 0).addsUp).toBe(false);
    expect(withDuration(pickup, 0, 2).addsUp).toBe(true);
  });
});
