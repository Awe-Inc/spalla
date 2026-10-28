import { db, localDayKey, starsFor, type ExerciseResult, type PracticeDay } from "./db";

const SECONDS_PER_DAY = 86_400;
const MILLISECONDS_PER_SECOND = 1000;
const NOON_OFFSET_MS = (SECONDS_PER_DAY / 2) * MILLISECONDS_PER_SECOND;
const RECORD_FIELD_COUNT = 8;
const UNKNOWN_DAY_MINUTES = 1;
const DAYS_LINE_KEYWORD = "days";

export interface NativeRecord {
  exerciseId: string;
  attempts: number;
  bestScore: number;
  bestAccuracy: number;
  bestBpm: number;
  lastAccuracy: number;
  bestMeanCents: number;
  lastPlayedSeconds: number;
}

export interface NativeProgress {
  records: NativeRecord[];
  dayNumbers: number[];
  damagedLines: number;
}

function parseRecord(fields: string[]): NativeRecord | null {
  if (fields.length !== RECORD_FIELD_COUNT) return null;
  const [exerciseId, ...rest] = fields;
  const numbers = rest.map(Number);
  if (!exerciseId || numbers.some((value) => !Number.isFinite(value))) return null;
  const [attempts, bestScore, bestAccuracy, bestBpm, lastAccuracy, bestMeanCents, lastPlayedSeconds] = numbers as [number, number, number, number, number, number, number];
  return { exerciseId, attempts, bestScore, bestAccuracy, bestBpm, lastAccuracy, bestMeanCents, lastPlayedSeconds };
}

function isDaysLine(fields: string[]): boolean {
  return fields[0] === DAYS_LINE_KEYWORD;
}

export function parseNativeProgress(text: string): NativeProgress {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split(/\s+/));
  const dayNumbers = lines.filter(isDaysLine).flatMap((fields) => fields.slice(1).map(Number).filter(Number.isInteger));
  const parsed = lines.filter((fields) => !isDaysLine(fields)).map(parseRecord);
  const records = parsed.filter((record): record is NativeRecord => record !== null && record.attempts > 0);
  return { records, dayNumbers: [...new Set(dayNumbers)].sort((a, b) => a - b), damagedLines: parsed.filter((record) => record === null).length };
}

export function dayKeyFromDayNumber(dayNumber: number): string {
  return localDayKey(new Date(dayNumber * SECONDS_PER_DAY * MILLISECONDS_PER_SECOND + NOON_OFFSET_MS));
}

export function resultFromNativeRecord(record: NativeRecord, writtenBpm: number | null, importedAt: number): ExerciseResult {
  return {
    exerciseId: record.exerciseId,
    playedAt: record.lastPlayedSeconds > 0 ? record.lastPlayedSeconds * MILLISECONDS_PER_SECOND : importedAt,
    accuracyPct: record.bestAccuracy,
    meanSignedCents: 0,
    bpm: record.bestBpm,
    stars: starsFor(record.bestAccuracy, record.bestBpm, writtenBpm ?? Number.POSITIVE_INFINITY),
    durationSeconds: 0,
    xpEarned: 0,
  };
}

export function practiceDaysFromNative(progress: NativeProgress): PracticeDay[] {
  const playedOn = new Map<string, number>();
  for (const record of progress.records) {
    if (record.lastPlayedSeconds <= 0) continue;
    const day = localDayKey(new Date(record.lastPlayedSeconds * MILLISECONDS_PER_SECOND));
    playedOn.set(day, (playedOn.get(day) ?? 0) + 1);
  }
  const days = new Set([...progress.dayNumbers.map(dayKeyFromDayNumber), ...playedOn.keys()]);
  return [...days].sort().map((day) => ({ day, minutes: UNKNOWN_DAY_MINUTES, exercisesPlayed: playedOn.get(day) ?? 0 }));
}

export interface NativeImportOutcome {
  results: number;
  days: number;
  skippedResults: number;
  skippedDays: number;
  damagedLines: number;
}

export async function importNativeProgress(text: string, writtenBpmOf: (exerciseId: string) => number | null, importedAt = Date.now()): Promise<NativeImportOutcome> {
  const progress = parseNativeProgress(text);
  const incomingDays = practiceDaysFromNative(progress);
  return db.transaction("rw", db.results, db.practiceDays, async () => {
    const [existingResults, existingDays] = await Promise.all([db.results.toArray(), db.practiceDays.toArray()]);
    const alreadyPlayed = new Set(existingResults.map((result) => result.exerciseId));
    const alreadyCounted = new Set(existingDays.filter((day) => day.minutes > 0).map((day) => day.day));
    const results = progress.records.filter((record) => !alreadyPlayed.has(record.exerciseId)).map((record) => resultFromNativeRecord(record, writtenBpmOf(record.exerciseId), importedAt));
    const days = incomingDays.filter((day) => !alreadyCounted.has(day.day));
    await Promise.all([db.results.bulkAdd(results), db.practiceDays.bulkPut(days)]);
    return {
      results: results.length,
      days: days.length,
      skippedResults: progress.records.length - results.length,
      skippedDays: incomingDays.length - days.length,
      damagedLines: progress.damagedLines,
    };
  });
}

export function nativeImportSentence(outcome: NativeImportOutcome): string {
  if (outcome.results === 0 && outcome.days === 0) {
    return outcome.skippedResults > 0 || outcome.skippedDays > 0 ? "Nada novo: esse progresso já estava aqui." : "Nenhum exercício encontrado no arquivo.";
  }
  const parts = [`${outcome.results} ${outcome.results === 1 ? "exercício" : "exercícios"}`, `${outcome.days} ${outcome.days === 1 ? "dia" : "dias"} de prática`];
  const skipped = outcome.skippedResults > 0 ? ` ${outcome.skippedResults} já tinham resultado aqui e ficaram como estavam.` : "";
  const damaged = outcome.damagedLines > 0 ? ` ${outcome.damagedLines} ${outcome.damagedLines === 1 ? "linha ilegível foi ignorada" : "linhas ilegíveis foram ignoradas"}.` : "";
  return `Importados ${parts.join(" e ")}.${skipped}${damaged}`;
}
