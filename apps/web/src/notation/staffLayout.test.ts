import type { Score, ScoreEvent } from "@fretless/core";
import { describe, expect, it } from "vitest";

import {
  barlineTimes,
  restShape,
  beamCount,
  buildGeometry,
  durationQuarters,
  keySignaturePositions,
  layoutBeam,
  layoutNoteMarks,
  ledgerLinePositions,
  noteX,
  positionY,
  slurSpans,
  staffPosition,
  stemUpFor,
  toneFor,
  visibleEventIndices,
} from "./staffLayout";

function event(overrides: Partial<ScoreEvent>): ScoreEvent {
  return {
    startSeconds: 0,
    durationSeconds: 0.5,
    startQuarters: 0,
    frequencyHz: 440,
    midi: 69,
    measure: 1,
    measureIndex: 0,
    beat: 1,
    isRest: false,
    isTiedFrom: false,
    string: 2,
    bowSpan: 1,
    bowSlot: 0, marks: "", dynamic: "", isGrace: false, graceSlashed: false, chordMidi: [], chordNames: [],
    noteName: "A4",
    latinName: "Lá4",
    ...overrides,
  };
}

function score(events: ScoreEvent[], overrides: Partial<Score> = {}): Score {
  return {
    title: "Teste",
    composer: "",
    partName: "",
    beatsPerMinute: 120,
    beatsPerMeasure: 4,
    beatUnit: 4,
    keyFifths: 0,
    durationSeconds: events.reduce((max, item) => Math.max(max, item.startSeconds + item.durationSeconds), 0),
    noteCount: events.filter((item) => !item.isRest).length,
    trimmedIntroSeconds: 0,
    tempoScale: 1,
    events,
    measures: [],
    beamGroups: [],
    expressions: [],
    ...overrides,
  };
}

describe("staffPosition", () => {
  it("puts E4 on the bottom line and climbs half a space per letter", () => {
    expect(staffPosition("E4")).toBe(0);
    expect(staffPosition("F4")).toBe(1);
    expect(staffPosition("B4")).toBe(4);
    expect(staffPosition("G5")).toBe(9);
  });

  it("reads the letter and octave past an accidental", () => {
    expect(staffPosition("F#5")).toBe(8);
    expect(staffPosition("Bb4")).toBe(4);
    expect(staffPosition("C4")).toBe(-2);
  });

  it("falls back to the bottom line for a name it cannot read", () => {
    expect(staffPosition("")).toBe(0);
    expect(staffPosition("H2")).toBe(0);
  });
});

describe("keySignaturePositions", () => {
  it("places sharps and flats in engraving order", () => {
    expect(keySignaturePositions(2)).toEqual([8, 5]);
    expect(keySignaturePositions(-1)).toEqual([4]);
    expect(keySignaturePositions(0)).toEqual([]);
    expect(keySignaturePositions(9)).toHaveLength(7);
  });
});

describe("beamCount", () => {
  it("counts beams from the nominal note value", () => {
    expect(beamCount(1)).toBe(0);
    expect(beamCount(0.5)).toBe(1);
    expect(beamCount(0.25)).toBe(2);
    expect(beamCount(0.375)).toBe(2);
    expect(beamCount(1 / 3)).toBe(1);
  });
});

describe("durationQuarters", () => {
  it("derives quarters from the gap to the next event", () => {
    const events = [
      event({ startSeconds: 0, startQuarters: 0, durationSeconds: 0.5 }),
      event({ startSeconds: 0.5, startQuarters: 1, durationSeconds: 0.5 }),
    ];
    expect(durationQuarters(score(events), 0)).toBeCloseTo(1);
    expect(durationQuarters(score(events), 1)).toBeCloseTo(1);
  });

  it("uses the score tempo for a lone event", () => {
    expect(durationQuarters(score([event({ durationSeconds: 1 })]), 0)).toBeCloseTo(2);
  });
});

describe("geometry", () => {
  it("keeps the playhead at a fifth of the width and scrolls notes towards it", () => {
    const geometry = buildGeometry(1000, 200, 2);
    expect(geometry.cursorX).toBe(200);
    expect(noteX(geometry, 2)).toBe(200);
    expect(noteX(geometry, 5)).toBe(600);
    expect(noteX(geometry, 1)).toBeLessThan(200);
  });

  it("gives notes below the middle line a stem up", () => {
    expect(stemUpFor(staffPosition("G4"))).toBe(true);
    expect(stemUpFor(staffPosition("B4"))).toBe(false);
  });

  it("adds ledger lines only past the staff", () => {
    expect(ledgerLinePositions(staffPosition("A5"))).toEqual([10]);
    expect(ledgerLinePositions(staffPosition("C4"))).toEqual([-2]);
    expect(ledgerLinePositions(staffPosition("B4"))).toEqual([]);
  });
});

describe("visible window", () => {
  it("includes notes about to arrive and drops those long gone", () => {
    const events = [
      event({ startSeconds: -5 }),
      event({ startSeconds: 0 }),
      event({ startSeconds: 5 }),
      event({ startSeconds: 20 }),
    ];
    const geometry = buildGeometry(1000, 200, 0);
    expect(visibleEventIndices(score(events), geometry)).toEqual([1, 2]);
  });

  it("lists barlines inside the window", () => {
    const measures = [0, 2, 4, 30].map((startSeconds, index) => ({
      number: index + 1,
      startQuarters: index * 4,
      startSeconds,
      endSeconds: startSeconds + 2,
      lengthQuarters: 4,
      beats: 4,
      beatUnit: 4,
      beatOffset: 0,
    }));
    expect(barlineTimes(score([], { measures }), buildGeometry(1000, 200, 0))).toEqual([0, 2, 4]);
  });
});

describe("layoutBeam", () => {
  it("points the stems away from where the group sits", () => {
    const low = [
      event({ startSeconds: 0, startQuarters: 0, durationSeconds: 0.25, noteName: "G4" }),
      event({ startSeconds: 0.25, startQuarters: 0.5, durationSeconds: 0.25, noteName: "A4" }),
    ];
    const high = low.map((item, index) => ({ ...item, noteName: index === 0 ? "D5" : "E5" }));
    const geometry = buildGeometry(1000, 200, 0);
    expect(layoutBeam(score(low), { first: 0, last: 1 }, geometry).stemUp).toBe(true);
    expect(layoutBeam(score(high), { first: 0, last: 1 }, geometry).stemUp).toBe(false);
  });
});

describe("toneFor", () => {
  it("colours the past by its verdict and the present as current", () => {
    const judgements = [
      { eventIndex: 0, grade: "Perfect" as const, meanCents: 0, worstCents: 0, onsetErrorSec: 0, voicedRatio: 1, offTuneRatio: 0, points: 1, comboAfter: 1, judgedAtSec: 1 },
    ];
    expect(toneFor(0, 2, judgements)).toBe("Perfect");
    expect(toneFor(1, 2, judgements)).toBe("unjudged");
    expect(toneFor(2, 2, judgements)).toBe("current");
    expect(toneFor(3, 2, judgements)).toBe("upcoming");
  });
});

describe("slurSpans", () => {
  it("keeps a bow group only when it closes", () => {
    const events = [
      event({ bowSpan: 2, bowSlot: 0 }),
      event({ bowSpan: 2, bowSlot: 1 }),
      event({ bowSpan: 3, bowSlot: 0 }),
      event({ bowSpan: 1, bowSlot: 0, marks: "", dynamic: "", isGrace: false, graceSlashed: false, chordMidi: [], chordNames: [], isRest: true }),
    ];
    expect(slurSpans(score(events), [0, 1, 2, 3])).toEqual([{ firstIndex: 0, lastIndex: 1 }]);
  });
});

describe("restShape", () => {
  it("draws a whole rest for a silent bar, whatever its length", () => {
    expect(restShape(2, 2)).toEqual({ kind: "whole", dotted: false });
    expect(restShape(3, 3)).toEqual({ kind: "whole", dotted: false });
  });

  it("picks the rest by duration and dots it when it lasts one and a half", () => {
    expect(restShape(2, 4)).toEqual({ kind: "half", dotted: false });
    expect(restShape(1, 4)).toEqual({ kind: "quarter", dotted: false });
    expect(restShape(1.5, 4)).toEqual({ kind: "quarter", dotted: true });
    expect(restShape(0.5, 4)).toEqual({ kind: "eighth", dotted: false });
    expect(restShape(0.25, 4)).toEqual({ kind: "sixteenth", dotted: false });
    expect(restShape(3, 4)).toEqual({ kind: "half", dotted: true });
  });
});

describe("marcas da nota", () => {
  const geometry = buildGeometry(800, 200, 0);
  const yOf = (position: number) => positionY(geometry, position);
  const placed = (marks: string, position: number, stemUp: boolean, tip: number) => layoutNoteMarks(marks, position, stemUp, tip, geometry).marks;

  it("põe a articulação do lado da cabeça, oposto à haste", () => {
    expect(placed("staccato", 1, true, yOf(1) - 40)[0]?.y).toBeCloseTo(yOf(-1));
    expect(placed("staccato", 7, false, yOf(7) + 40)[0]?.y).toBeCloseTo(yOf(9));
  });

  it("dentro da pauta, a articulação cai no espaço, nunca sobre a linha", () => {
    expect(placed("staccato", 2, true, yOf(2) - 40)[0]?.y).toBeCloseTo(yOf(-1));
    expect(placed("staccato", 4, false, yOf(4) + 40)[0]?.y).toBeCloseTo(yOf(7));
  });

  it("empilha articulações para longe da cabeça", () => {
    const [first, second] = placed("accent staccato", 7, false, yOf(7) + 40);
    expect(first?.mark).toBe("staccato");
    expect(second?.mark).toBe("accent");
    expect(second?.y ?? 0).toBeLessThan(first?.y ?? 0);
  });

  it("fermata e arcada ficam acima da pauta e da haste, sem se sobrepor", () => {
    const tip = geometry.staffTop - 30;
    const [fermata, bow] = placed("fermata up-bow", 6, true, tip);
    expect(fermata?.y ?? 0).toBeLessThan(tip);
    expect(bow?.y ?? 0).toBeLessThan(fermata?.y ?? 0);
  });

  it("a dinâmica fica abaixo da pauta e abaixo de uma haste para baixo", () => {
    const inside = layoutNoteMarks("", 8, false, yOf(2), geometry);
    expect(inside.dynamicY).toBeGreaterThan(geometry.bottomY);
    const tip = geometry.bottomY + 20;
    expect(layoutNoteMarks("", 1, false, tip, geometry).dynamicY).toBeGreaterThan(tip);
  });

  it("nada desenhado fora do quadro numa nota muito aguda", () => {
    const high = layoutNoteMarks("fermata", 20, true, yOf(26), geometry);
    expect(high.marks[0]?.y ?? -1).toBeGreaterThanOrEqual(0);
  });
});
