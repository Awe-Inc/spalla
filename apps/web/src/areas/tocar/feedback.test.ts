import { describe, expect, it } from "vitest";
import type { NoteJudgement, Score } from "@fretless/core";

import { errorGroupSentence, groupErrors, measureSentence, noteErrors, type NoteError } from "./feedback";

const score = {
  events: [
    { measureIndex: 0, noteName: "A4", string: 1 },
    { measureIndex: 0, noteName: "B4", string: 2 },
    { measureIndex: 1, noteName: "C5", string: 3 },
    { measureIndex: 1, noteName: "D5", string: 3 },
    { measureIndex: 1, noteName: "E5", string: 3 },
    { measureIndex: 1, noteName: "F5", string: 3 },
  ],
} as unknown as Score;

function judgement(eventIndex: number, changes: Partial<NoteJudgement>): NoteJudgement {
  return { eventIndex, grade: "Good", meanCents: 0, onsetErrorSec: 0, offTuneRatio: 0, ...changes } as NoteJudgement;
}

describe("noteErrors", () => {
  it("does not point at a clean note, even a little off and a little late", () => {
    expect(noteErrors(score, [judgement(0, { meanCents: 20, onsetErrorSec: 0.12 })])).toEqual([]);
  });

  it("names the direction of an out-of-tune note", () => {
    const errors = noteErrors(score, [judgement(0, { meanCents: 25 }), judgement(1, { meanCents: -25 })]);
    expect(errors.map((error) => [error.kind, error.direction])).toEqual([
      ["afinacao", "alta"],
      ["afinacao", "baixa"],
    ]);
  });

  it("names the direction of a note out of time", () => {
    const errors = noteErrors(score, [judgement(0, { onsetErrorSec: 0.2 }), judgement(1, { onsetErrorSec: -0.2 })]);
    expect(errors.map((error) => [error.kind, error.direction])).toEqual([
      ["ritmo", "atrasada"],
      ["ritmo", "adiantada"],
    ]);
  });

  it("counts one note in both kinds when it is off and late", () => {
    const errors = noteErrors(score, [judgement(0, { meanCents: 30, onsetErrorSec: 0.2 })]);
    expect(errors.map((error) => error.kind)).toEqual(["afinacao", "ritmo"]);
  });

  it("tells a wrong pitch from a note that was never heard", () => {
    const errors = noteErrors(score, [
      judgement(0, { grade: "Miss", offTuneRatio: 0.8 }),
      judgement(1, { grade: "Miss", offTuneRatio: 0 }),
      judgement(2, { grade: "Unheard" }),
    ]);
    expect(errors.map((error) => error.kind)).toEqual(["afinacao", "nao-ouvida", "nao-ouvida"]);
  });

  it("ignores a judgement without a matching note", () => {
    expect(noteErrors(score, [judgement(99, { grade: "Miss" })])).toEqual([]);
  });
});

describe("groupErrors", () => {
  it("orders the kinds, omits empty ones and puts the most repeated note first", () => {
    const errors = noteErrors(score, [
      judgement(0, { grade: "Unheard" }),
      judgement(1, { meanCents: 30 }),
      judgement(2, { meanCents: -30 }),
      judgement(2, { meanCents: -30 }),
    ]);
    const groups = groupErrors(errors);
    expect(groups.map((group) => group.kind)).toEqual(["afinacao", "nao-ouvida"]);
    expect(groups[0]).toMatchObject({ count: 3, directions: { alta: 1, baixa: 2 } });
    expect(groups[0]?.notes[0]).toEqual({ noteName: "C5", string: 3, count: 2 });
  });
});

describe("errorGroupSentence", () => {
  it("names the notes on their strings, how many times and in which direction", () => {
    const errors = noteErrors(score, [judgement(2, { meanCents: -30 }), judgement(2, { meanCents: -30 }), judgement(1, { meanCents: 30 })]);
    const [group] = groupErrors(errors);
    expect(errorGroupSentence(group!, "latin")).toBe("Dó5 na corda Mi (2 vezes), Si4 na corda Lá. 2 baixas, 1 alta.");
  });

  it("follows the chosen note naming", () => {
    const [group] = groupErrors(noteErrors(score, [judgement(2, { meanCents: 30 })]));
    expect(errorGroupSentence(group!, "letters")).toBe("C5 na corda Mi. 1 alta.");
  });

  it("leaves the string out when the note has none suggested", () => {
    const errors: NoteError[] = [{ eventIndex: 0, measureIndex: 0, noteName: "C5", string: -1, kind: "nao-ouvida", direction: null }];
    const [group] = groupErrors(errors);
    expect(errorGroupSentence(group!, "letters")).toBe("C5.");
  });

  it("shows three notes and counts the others", () => {
    const errors = noteErrors(score, [2, 3, 4, 5, 0].map((index) => judgement(index, { grade: "Unheard" })));
    const [group] = groupErrors(errors);
    expect(errorGroupSentence(group!, "letters")).toBe("C5 na corda Mi, D5 na corda Mi, E5 na corda Mi, e mais 2 notas.");
  });
});

describe("measureSentence", () => {
  const stat = { measureIndex: 1, measureNumber: 2, accuracyPct: 50 } as Parameters<typeof measureSentence>[0];

  it("reports only the errors of that measure", () => {
    const errors = noteErrors(score, [judgement(0, { meanCents: 30 }), judgement(2, { onsetErrorSec: 0.2 })]);
    expect(measureSentence(stat, errors, "letters")).toBe("Compasso 2: 50% certas. Ritmo: C5 na corda Mi. 1 atrasada.");
  });

  it("says when there is nothing to point at", () => {
    expect(measureSentence(stat, [], "letters")).toBe("Compasso 2: 50% certas. Nenhum erro a apontar.");
  });

  it("says when the measure was not played", () => {
    expect(measureSentence({ ...stat, accuracyPct: null }, [], "letters")).toBe("Compasso 2: não tocado.");
  });
});
