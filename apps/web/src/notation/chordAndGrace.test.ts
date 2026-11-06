import type { Measure, Score, ScoreEvent } from "@fretless/core";
import { describe, expect, it, vi } from "vitest";

import { drawExpressions, type Palette } from "@/areas/tocar/staffPaint";
import { playableNotes } from "@/audio/scorePlayback";

import { buildGeometry, chordHeads, durationQuarters, graceSlot, isHollowHead, beamCount } from "./staffLayout";

function event(overrides: Partial<ScoreEvent>): ScoreEvent {
  return {
    startSeconds: 0,
    durationSeconds: 1,
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
    bowSlot: 0,
    marks: "",
    dynamic: "",
    isGrace: false,
    graceSlashed: false,
    chordMidi: [],
    chordNames: [],
    noteName: "A4",
    latinName: "Lá4",
    ...overrides,
  };
}

function scoreOf(events: ScoreEvent[]): Score {
  const measure: Measure = { number: 1, startQuarters: 0, startSeconds: 0, endSeconds: 4, lengthQuarters: 4, beats: 4, beatUnit: 4, beatOffset: 0 };
  return {
    title: "",
    composer: "",
    partName: "",
    beatsPerMinute: 60,
    beatsPerMeasure: 4,
    beatUnit: 4,
    keySignature: 0,
    durationSeconds: 4,
    noteCount: events.length,
    measureCount: 1,
    events,
    measures: [measure],
    beamGroups: [],
    expressions: [],
  } as unknown as Score;
}

const palette = { ink: "#000", inkMuted: "#555", music: "serif", mono: "monospace", paper: "#fff" } as unknown as Palette;

describe("nota de enfeite", () => {
  const events = [
    event({ isGrace: true, graceSlashed: true, durationSeconds: 0.125, noteName: "B4" }),
    event({ isGrace: true, startSeconds: 0.125, startQuarters: 0.125, durationSeconds: 0.125, noteName: "C5" }),
    event({ startSeconds: 0.25, startQuarters: 0.25, durationSeconds: 1.75 }),
    event({ startSeconds: 2, startQuarters: 2, durationSeconds: 2 }),
  ];

  it("fica antes da nota principal, contada a partir dela", () => {
    expect(graceSlot(events, 0)).toEqual({ principal: 2, stepsBefore: 2 });
    expect(graceSlot(events, 1)).toEqual({ principal: 2, stepsBefore: 1 });
    expect(graceSlot(events, 2)).toBeNull();
  });

  it("não muda a figura da principal: mínima segue com cabeça vazada e sem bandeira", () => {
    const quarters = durationQuarters(scoreOf(events), 2);
    expect(quarters).toBeCloseTo(2);
    expect(isHollowHead(quarters)).toBe(true);
    expect(beamCount(quarters)).toBe(0);
  });
});

describe("corda dupla", () => {
  it("lista as notas de baixo com o acidente de cada uma", () => {
    const stop = event({ noteName: "E5", chordNames: ["C#5"], chordMidi: [73], midi: 76 });
    expect(chordHeads(stop, true)).toEqual([{ position: 5, accidental: "#", side: 0 }]);
  });

  it("afasta para o lado a cabeça a um grau de distância, do lado certo da haste", () => {
    const stop = event({ noteName: "B4", chordNames: ["A4"], chordMidi: [69], midi: 71 });
    expect(chordHeads(stop, true)[0]?.side).toBe(1);
    expect(chordHeads(stop, false)[0]?.side).toBe(-1);
  });

  it("toca todas as notas no acompanhamento", () => {
    const notes = playableNotes(scoreOf([event({ midi: 76, chordMidi: [69], chordNames: ["A4"] })]));
    expect(notes.map((note) => note.midi).sort()).toEqual([69, 76]);
    expect(new Set(notes.map((note) => note.startSec)).size).toBe(1);
  });
});

function fakeContext() {
  return {
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D & { fillText: ReturnType<typeof vi.fn>; moveTo: ReturnType<typeof vi.fn>; lineTo: ReturnType<typeof vi.fn> };
}

describe("cunhas e dinâmica tardia", () => {
  const geometry = buildGeometry(800, 200, 0);

  it("crescendo abre para a direita", () => {
    const ctx = fakeContext();
    drawExpressions(ctx, [{ kind: "crescendo", startSeconds: 1, endSeconds: 2, text: "" }], 0, 6, geometry, palette);
    const [pointX] = ctx.moveTo.mock.calls[0] as [number, number];
    const [mouthX] = ctx.lineTo.mock.calls[0] as [number, number];
    expect(mouthX).toBeGreaterThan(pointX);
  });

  it("decrescendo fecha para a direita", () => {
    const ctx = fakeContext();
    drawExpressions(ctx, [{ kind: "diminuendo", startSeconds: 1, endSeconds: 2, text: "" }], 0, 6, geometry, palette);
    const [pointX] = ctx.moveTo.mock.calls[0] as [number, number];
    const [mouthX] = ctx.lineTo.mock.calls[0] as [number, number];
    expect(mouthX).toBeLessThan(pointX);
  });

  it("escreve a dinâmica que caiu em nota ligada e ignora o que está fora da janela", () => {
    const ctx = fakeContext();
    const expressions = [
      { kind: "dynamic" as const, startSeconds: 1, endSeconds: 1, text: "p" },
      { kind: "dynamic" as const, startSeconds: 9, endSeconds: 9, text: "f" },
    ];
    drawExpressions(ctx, expressions, 0, 6, geometry, palette);
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.fillText.mock.calls[0]?.[0]).toBe("p");
  });
});
