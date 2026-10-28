import { describe, expect, it } from "vitest";
import type { GameStats, NoteJudgement, Score } from "@fretless/core";
import { autoSlowdown, slowdownSentence } from "./autoSlowdown";

const limits = { writtenBpm: 80, minBpm: 40, maxBpm: 120 };

function scoreOf(notesPerMeasure: number[]): Score {
  const events = notesPerMeasure.flatMap((count, measureIndex) => Array.from({ length: count }, () => ({ measureIndex, isRest: false })));
  const measures = notesPerMeasure.map((_, index) => ({ number: index + 1 }));
  return { events, measures } as unknown as Score;
}

function judgements(grades: NoteJudgement["grade"][]): NoteJudgement[] {
  return grades.map((grade, eventIndex) => ({ eventIndex, grade, meanCents: 0 }) as unknown as NoteJudgement);
}

function statsOf(grades: NoteJudgement["grade"][]): GameStats {
  const hits = grades.filter((grade) => grade !== "Miss").length;
  return { judgedNotes: grades.length, accuracyPct: (hits / grades.length) * 100 } as unknown as GameStats;
}

describe("autoSlowdown", () => {
  it("lowers the tempo when one bar comes out hard", () => {
    const grades: NoteJudgement["grade"][] = ["Perfect", "Perfect", "Perfect", "Perfect", "Miss", "Miss", "Good", "Miss"];
    const result = autoSlowdown(scoreOf([4, 4]), judgements(grades), statsOf(grades), 80, limits);
    expect(result).toEqual({ fromBpm: 80, bpm: 70, measureNumber: 2 });
  });

  it("names the worst bar when several are hard", () => {
    const grades: NoteJudgement["grade"][] = ["Miss", "Good", "Good", "Miss", "Miss", "Good"];
    const result = autoSlowdown(scoreOf([3, 3]), judgements(grades), statsOf(grades), 80, limits);
    expect(result?.measureNumber).toBe(2);
  });

  it("ignores a bar with too few judged notes", () => {
    const grades: NoteJudgement["grade"][] = ["Perfect", "Perfect", "Perfect", "Perfect", "Miss", "Miss"];
    const result = autoSlowdown(scoreOf([4, 4]), judgements(grades), statsOf(grades), 80, limits);
    expect(result).toBeNull();
  });

  it("falls back to the whole run when no single bar stands out", () => {
    const grades: NoteJudgement["grade"][] = ["Miss", "Good", "Good", "Good", "Miss", "Good", "Good", "Good"];
    const roughStats = { judgedNotes: 8, accuracyPct: 50 } as unknown as GameStats;
    const result = autoSlowdown(scoreOf([4, 4]), judgements(grades), roughStats, 80, limits);
    expect(result).toEqual({ fromBpm: 80, bpm: 70, measureNumber: null });
  });

  it("does nothing when the run was clean", () => {
    const grades: NoteJudgement["grade"][] = ["Perfect", "Great", "Good", "Perfect", "Great", "Good"];
    expect(autoSlowdown(scoreOf([3, 3]), judgements(grades), statsOf(grades), 80, limits)).toBeNull();
  });

  it("does nothing at the floor of the range", () => {
    const grades: NoteJudgement["grade"][] = ["Miss", "Miss", "Miss"];
    expect(autoSlowdown(scoreOf([3]), judgements(grades), statsOf(grades), 40, limits)).toBeNull();
  });
});

describe("slowdownSentence", () => {
  it("blames the bar when there is one", () => {
    expect(slowdownSentence({ fromBpm: 80, bpm: 70, measureNumber: 3 })).toBe("O compasso 3 ficou difícil. O andamento baixou para 70 bpm na próxima.");
  });

  it("blames the run otherwise", () => {
    expect(slowdownSentence({ fromBpm: 80, bpm: 70, measureNumber: null })).toBe("Ficou corrido. O andamento baixou para 70 bpm na próxima.");
  });
});
