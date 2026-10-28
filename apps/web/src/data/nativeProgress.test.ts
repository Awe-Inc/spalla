import { describe, expect, it } from "vitest";

import { dayKeyFromDayNumber, nativeImportSentence, parseNativeProgress, practiceDaysFromNative, resultFromNativeRecord } from "./nativeProgress";

const sample = [
  "# fretless progress v1",
  "# id attempts bestScore bestAccuracy bestBpm lastAccuracy bestMeanCents lastPlayed",
  "days 20754 20753 20750 20754",
  "scales.2oct.69 5 400 92.5 80 55 9.25 1793145600",
  "suzuki.twinkle.0 1 120 97 60 97 4 1793232000",
  "never.played 0 0 0 0 0 0 0",
  "broken line without numbers",
  "",
].join("\n");

describe("parseNativeProgress", () => {
  it("reads records and days, skips comments, unplayed and damaged lines", () => {
    const progress = parseNativeProgress(sample);
    expect(progress.records.map((record) => record.exerciseId)).toEqual(["scales.2oct.69", "suzuki.twinkle.0"]);
    expect(progress.records[0]).toEqual({ exerciseId: "scales.2oct.69", attempts: 5, bestScore: 400, bestAccuracy: 92.5, bestBpm: 80, lastAccuracy: 55, bestMeanCents: 9.25, lastPlayedSeconds: 1793145600 });
    expect(progress.dayNumbers).toEqual([20750, 20753, 20754]);
    expect(progress.damagedLines).toBe(1);
  });

  it("accepts Windows line endings", () => {
    expect(parseNativeProgress("days 1\r\nx 1 2 3 4 5 6 7\r\n").records).toHaveLength(1);
  });

  it("treats a days line without numbers as empty, not as damage", () => {
    const progress = parseNativeProgress("days\nx 1 2 3 4 5 6 7\n");
    expect(progress.dayNumbers).toEqual([]);
    expect(progress.damagedLines).toBe(0);
  });
});

describe("resultFromNativeRecord", () => {
  const record = parseNativeProgress(sample).records[1]!;

  it("keeps the best accuracy and tempo and grades stars against the written tempo", () => {
    expect(resultFromNativeRecord(record, 60, 0)).toMatchObject({ exerciseId: "suzuki.twinkle.0", accuracyPct: 97, bpm: 60, stars: 3, playedAt: 1793232000000, xpEarned: 0 });
    expect(resultFromNativeRecord(record, 80, 0).stars).toBe(2);
    expect(resultFromNativeRecord(record, null, 0).stars).toBe(2);
  });

  it("falls back to the import time when the record never stored a date", () => {
    expect(resultFromNativeRecord({ ...record, lastPlayedSeconds: 0 }, 60, 42).playedAt).toBe(42);
  });
});

describe("practiceDaysFromNative", () => {
  it("turns UTC day numbers into local days and counts the exercises last played on each", () => {
    const days = practiceDaysFromNative(parseNativeProgress(sample));
    expect(dayKeyFromDayNumber(20754)).toBe("2026-10-28");
    expect(days.map((day) => day.day)).toEqual(["2026-10-24", "2026-10-27", "2026-10-28"]);
    expect(days.every((day) => day.minutes === 1)).toBe(true);
    expect(days.find((day) => day.day === "2026-10-28")?.exercisesPlayed).toBe(1);
  });
});

describe("nativeImportSentence", () => {
  it("tells what came in, what already existed and what could not be read", () => {
    expect(nativeImportSentence({ results: 2, days: 3, skippedResults: 1, skippedDays: 0, damagedLines: 1 })).toBe(
      "Importados 2 exercícios e 3 dias de prática. 1 já tinham resultado aqui e ficaram como estavam. 1 linha ilegível foi ignorada.",
    );
    expect(nativeImportSentence({ results: 0, days: 0, skippedResults: 2, skippedDays: 2, damagedLines: 0 })).toBe("Nada novo: esse progresso já estava aqui.");
    expect(nativeImportSentence({ results: 0, days: 0, skippedResults: 0, skippedDays: 0, damagedLines: 0 })).toBe("Nenhum exercício encontrado no arquivo.");
  });
});
