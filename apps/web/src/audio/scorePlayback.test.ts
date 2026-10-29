import type { Score, ScoreEvent } from "@fretless/core";
import { describe, expect, it } from "vitest";
import { eventIndexAt, notesBetween, playableNotes, playbackWindow } from "./scorePlayback";

function event(midi: number, startSeconds: number, durationSeconds: number, measureIndex: number, extra: Partial<ScoreEvent> = {}): ScoreEvent {
  return { midi, startSeconds, durationSeconds, measureIndex, isRest: false, isTiedFrom: false, ...extra } as ScoreEvent;
}

function scoreOf(events: ScoreEvent[], measureSeconds = 2, measureCount = 3): Score {
  const measures = Array.from({ length: measureCount }, (_, index) => ({ startSeconds: index * measureSeconds, endSeconds: (index + 1) * measureSeconds }));
  return { events, measures, durationSeconds: measureCount * measureSeconds } as unknown as Score;
}

describe("playableNotes", () => {
  it("skips rests", () => {
    const score = scoreOf([event(69, 0, 1, 0), event(0, 1, 1, 0, { isRest: true }), event(71, 2, 1, 1)]);
    expect(playableNotes(score).map((note) => note.midi)).toEqual([69, 71]);
  });

  it("joins a tied note into one longer note", () => {
    const score = scoreOf([event(69, 1, 1, 0), event(69, 2, 1.5, 1, { isTiedFrom: true }), event(71, 3.5, 0.5, 1)]);
    expect(playableNotes(score)).toEqual([
      { midi: 69, startSec: 1, durationSec: 2.5 },
      { midi: 71, startSec: 3.5, durationSec: 0.5 },
    ]);
  });

  it("keeps only the bars of the excerpt, in score time", () => {
    const score = scoreOf([event(67, 0, 2, 0), event(69, 2, 2, 1), event(71, 4, 2, 2)]);
    expect(playableNotes(score, { firstIndex: 1, lastIndex: 1 })).toEqual([{ midi: 69, startSec: 2, durationSec: 2 }]);
  });
});

describe("playbackWindow", () => {
  it("spans the whole piece without an excerpt", () => {
    expect(playbackWindow(scoreOf([]))).toEqual({ startSec: 0, endSec: 6 });
  });

  it("spans the bars of the excerpt", () => {
    expect(playbackWindow(scoreOf([]), { firstIndex: 1, lastIndex: 2 })).toEqual({ startSec: 2, endSec: 6 });
  });
});

describe("notesBetween", () => {
  it("returns the notes that start inside the window, once", () => {
    const notes = [
      { midi: 1, startSec: 0, durationSec: 1 },
      { midi: 2, startSec: 1, durationSec: 1 },
      { midi: 3, startSec: 2, durationSec: 1 },
    ];
    expect(notesBetween(notes, 0, 1).map((note) => note.midi)).toEqual([1]);
    expect(notesBetween(notes, 1, 3).map((note) => note.midi)).toEqual([2, 3]);
  });
});

describe("eventIndexAt", () => {
  it("points at the note sounding now and at the first before the start", () => {
    const events = [event(67, 0, 1, 0), event(69, 1, 1, 0), event(71, 2, 1, 1)];
    expect(eventIndexAt(events, -0.4)).toBe(0);
    expect(eventIndexAt(events, 1.5)).toBe(1);
    expect(eventIndexAt(events, 9)).toBe(2);
  });
});
