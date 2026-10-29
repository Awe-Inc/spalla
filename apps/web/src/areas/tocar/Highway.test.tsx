import type { NoteJudgement, Score, ScoreEvent } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { drawHighway } from "./Highway";

const palette = {
  paper: "paper",
  ink: "ink",
  barline: "barline",
  strings: ["sol", "re", "la", "mi"],
  inTune: "in-tune",
  close: "close",
  off: "off",
  sans: "sans",
};

function note(overrides: Partial<ScoreEvent>): ScoreEvent {
  return {
    startSeconds: 0,
    durationSeconds: 0.5,
    startQuarters: 0,
    frequencyHz: 659.26,
    midi: 76,
    measure: 1,
    measureIndex: 0,
    beat: 1,
    isRest: false,
    isTiedFrom: false,
    string: 3,
    bowSpan: 1,
    bowSlot: 0,
    noteName: "E5",
    latinName: "Mi5",
    ...overrides,
  };
}

function score(events: ScoreEvent[]): Score {
  return {
    title: "Teste",
    composer: "",
    partName: "",
    beatsPerMinute: 60,
    beatsPerMeasure: 4,
    beatUnit: 4,
    keyFifths: 0,
    durationSeconds: 4,
    noteCount: events.length,
    trimmedIntroSeconds: 0,
    tempoScale: 1,
    events,
    measures: [],
    beamGroups: [],
  };
}

function recordingContext() {
  const bars: { fill: string; stroked: boolean }[] = [];
  let pending: { fill: string; stroked: boolean } | null = null;
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    font: "",
    textBaseline: "",
    textAlign: "",
    clearRect: () => {},
    fillRect: () => {},
    fillText: () => {},
    beginPath: () => {},
    roundRect: () => {
      pending = { fill: "", stroked: false };
      bars.push(pending);
    },
    fill: () => {
      if (pending) pending.fill = ctx.fillStyle;
    },
    stroke: () => {
      if (pending) pending.stroked = true;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, bars };
}

const size = { width: 1000, height: 240 };

describe("drawHighway", () => {
  it("paints each note in its string's colour and outlines the one being played", () => {
    const { ctx, bars } = recordingContext();
    const events = [note({ startSeconds: 0, string: 3 }), note({ startSeconds: 1, string: 0, noteName: "G3" })];
    drawHighway(ctx, size, palette, { score: score(events), songTime: 0, currentNoteIndex: 0, judgements: [] });
    expect(bars).toEqual([
      { fill: "mi", stroked: true },
      { fill: "sol", stroked: false },
    ]);
  });

  it("repaints a judged note with the verdict colour", () => {
    const { ctx, bars } = recordingContext();
    const events = [note({ startSeconds: 0 }), note({ startSeconds: 0.5 }), note({ startSeconds: 1 })];
    const judgements = [
      { eventIndex: 0, grade: "Miss" },
      { eventIndex: 1, grade: "Good" },
    ] as NoteJudgement[];
    drawHighway(ctx, size, palette, { score: score(events), songTime: 1, currentNoteIndex: 2, judgements });
    expect(bars.map((bar) => bar.fill)).toEqual(["off", "close", "mi"]);
  });

  it("draws no bar for a rest", () => {
    const { ctx, bars } = recordingContext();
    drawHighway(ctx, size, palette, { score: score([note({ isRest: true })]), songTime: 0, currentNoteIndex: 0, judgements: [] });
    expect(bars).toHaveLength(0);
  });
});
