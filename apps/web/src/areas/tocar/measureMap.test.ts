import { describe, expect, it } from "vitest";
import type { NoteJudgement, Score } from "@fretless/core";
import { hardestRange, measureStats, measureTone } from "./measureMap";

function scoreOf(notesPerMeasure: number[]): Score {
  const events = notesPerMeasure.flatMap((count, measureIndex) =>
    Array.from({ length: count }, () => ({ measureIndex, isRest: false })),
  );
  const measures = notesPerMeasure.map((_, index) => ({ number: index + 1 }));
  return { events, measures } as unknown as Score;
}

function judgement(eventIndex: number, grade: NoteJudgement["grade"], meanCents = 0): NoteJudgement {
  return { eventIndex, grade, meanCents } as unknown as NoteJudgement;
}

describe("measureStats", () => {
  it("aggregates hits, misses and drift per bar", () => {
    const score = scoreOf([2, 2]);
    const stats = measureStats(score, [
      judgement(0, "Perfect", 4),
      judgement(1, "Good", 10),
      judgement(2, "Miss"),
      judgement(3, "Great", -6),
    ]);
    expect(stats[0]).toMatchObject({ notes: 2, judged: 2, hits: 2, misses: 0, accuracyPct: 100, meanSignedCents: 7 });
    expect(stats[1]).toMatchObject({ notes: 2, judged: 2, hits: 1, misses: 1, accuracyPct: 50, meanSignedCents: -6 });
  });

  it("leaves unplayed bars without an accuracy", () => {
    const stats = measureStats(scoreOf([1, 1]), [judgement(0, "Perfect")]);
    expect(stats[1]?.accuracyPct).toBeNull();
    expect(measureTone(stats[1]!)).toBe("unplayed");
  });
});

describe("hardestRange", () => {
  it("returns null when every bar is fine", () => {
    const stats = measureStats(scoreOf([1, 1]), [judgement(0, "Perfect"), judgement(1, "Great")]);
    expect(hardestRange(stats)).toBeNull();
  });

  it("grows the range around the worst bar over its hard neighbours", () => {
    const stats = measureStats(scoreOf([2, 2, 2, 2]), [
      judgement(0, "Perfect"),
      judgement(1, "Perfect"),
      judgement(2, "Miss"),
      judgement(3, "Good"),
      judgement(4, "Miss"),
      judgement(5, "Miss"),
      judgement(6, "Perfect"),
      judgement(7, "Perfect"),
    ]);
    expect(hardestRange(stats)).toEqual({ firstIndex: 1, lastIndex: 2 });
  });

  it("gives a lone hard bar a two-bar loop", () => {
    const stats = measureStats(scoreOf([1, 1, 1]), [judgement(0, "Miss"), judgement(1, "Perfect"), judgement(2, "Perfect")]);
    expect(hardestRange(stats)).toEqual({ firstIndex: 0, lastIndex: 1 });
  });
});

describe("measureTone", () => {
  it("maps accuracy to a tone", () => {
    const base = { measureIndex: 0, measureNumber: 1, notes: 1, judged: 1, hits: 1, misses: 0, meanSignedCents: 0 };
    expect(measureTone({ ...base, accuracyPct: 95 })).toBe("clean");
    expect(measureTone({ ...base, accuracyPct: 75 })).toBe("shaky");
    expect(measureTone({ ...base, accuracyPct: 40 })).toBe("hard");
  });
});
