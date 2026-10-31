import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BACKUP_TABLES, BACKUP_VERSION, BackupFormatError, buildBackup, parseBackup, resetProgress, restoreBackup, restoreSentence, serializeBackup } from "./backup";
import { db, DEFAULT_USER_STATS, type ExerciseResult } from "./db";

const SETTINGS_KEY = "fretless-settings";

function result(exerciseId: string, playedAt: number): ExerciseResult {
  return { exerciseId, playedAt, accuracyPct: 91, meanSignedCents: -4, bpm: 72, stars: 2, durationSeconds: 40 };
}

async function clearAll(): Promise<void> {
  await Promise.all(db.tables.map((table) => table.clear()));
}

async function seed(): Promise<void> {
  await db.results.bulkAdd([result("scales.1oct.69", 1), result("warmup.open.A", 2)]);
  await db.userStats.put({ ...DEFAULT_USER_STATS, xp: 420 });
  await db.practiceDays.put({ day: "2026-10-30", minutes: 25, xp: 80 } as never);
  await db.pieces.add({ fileName: "minueto.mxl", title: "Minueto", composer: "Bach", genre: "", level: 3, bytes: new Uint8Array([80, 75, 3, 4, 255]), noteCount: 48, beatsPerMinute: 96, importedAt: 5 });
  const sheetId = await db.sheets.add({ fileName: "wohlfahrt.pdf", title: "Wohlfahrt", pageCount: 12, lastPage: 3, importedAt: 6, openedAt: 7 });
  await db.sheetFiles.put({ id: sheetId as number, bytes: new Uint8Array([37, 80, 68, 70]) });
  const recordingId = await db.recordings.add({ name: "Antes", pieceKey: null, pieceTitle: null, mimeType: "audio/webm", durationMs: 1200, sizeBytes: 3, createdAt: 8 });
  await db.recordingFiles.put({ id: recordingId as number, bytes: new Uint8Array([26, 69, 223]) });
}

describe("backup", () => {
  beforeEach(async () => {
    await clearAll();
    localStorage.clear();
  });

  afterEach(async () => {
    await clearAll();
  });

  it("carries every local table, the binary files and the settings", async () => {
    await seed();
    localStorage.setItem(SETTINGS_KEY, '{"state":{"theme":"dark"},"version":0}');
    const backup = await buildBackup();
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(Object.keys(backup)).toEqual(expect.arrayContaining([...BACKUP_TABLES]));
    expect(backup.settings).toContain('"theme":"dark"');
    expect(serializeBackup(backup)).toContain('"$bytes"');
  });

  it("restores exactly what was exported, bytes included", async () => {
    await seed();
    localStorage.setItem(SETTINGS_KEY, '{"state":{"theme":"dark"},"version":0}');
    const text = serializeBackup(await buildBackup());

    await clearAll();
    localStorage.clear();
    await db.results.add(result("leftover", 99));

    const summary = await restoreBackup(parseBackup(text));

    expect(summary.settings).toBe(true);
    expect(localStorage.getItem(SETTINGS_KEY)).toContain('"theme":"dark"');
    expect((await db.results.toArray()).map((row) => row.exerciseId).sort()).toEqual(["scales.1oct.69", "warmup.open.A"]);
    expect((await db.userStats.get("me"))?.xp).toBe(420);
    const piece = (await db.pieces.toArray())[0];
    expect(Object.prototype.toString.call(piece?.bytes)).toBe("[object Uint8Array]");
    expect(Array.from(piece?.bytes ?? [])).toEqual([80, 75, 3, 4, 255]);
    expect(Array.from((await db.sheetFiles.toArray())[0]?.bytes ?? [])).toEqual([37, 80, 68, 70]);
    expect(Array.from((await db.recordingFiles.toArray())[0]?.bytes ?? [])).toEqual([26, 69, 223]);
    expect(restoreSentence(summary)).toBe(`Backup restaurado: ${summary.rows} registros. As configurações também voltaram.`);
  });

  it("restores a version 1 backup without touching the tables it never had", async () => {
    await db.pieces.add({ fileName: "fica.mxl", title: "Fica", composer: "", genre: "", level: 1, bytes: new Uint8Array([1]), noteCount: 1, beatsPerMinute: 60, importedAt: 1 });
    const legacy = JSON.stringify({ version: 1, exportedAt: "2026-10-01T00:00:00.000Z", results: [result("old", 1)], routines: [], practiceDays: [], userStats: [], achievements: [], lessonTasks: [], suzukiPieces: [], pieceSections: [], pieces: { count: 1 } });

    const summary = await restoreBackup(parseBackup(legacy));

    expect(summary.settings).toBe(false);
    expect((await db.results.toArray()).map((row) => row.exerciseId)).toEqual(["old"]);
    expect(await db.pieces.count()).toBe(1);
  });

  it("restores a backup that only carries settings", async () => {
    await seed();
    const summary = await restoreBackup(parseBackup(JSON.stringify({ version: BACKUP_VERSION, exportedAt: "", settings: "{\"state\":{}}" })));
    expect(summary).toEqual({ rows: 0, tables: 0, settings: true });
    expect(await db.results.count()).toBeGreaterThan(0);
  });

  it("refuses files that are not a backup, are newer or are cut short", () => {
    expect(() => parseBackup("não é json")).toThrow(BackupFormatError);
    expect(() => parseBackup('{"results":[]}')).toThrow("não é um backup");
    expect(() => parseBackup(JSON.stringify({ version: BACKUP_VERSION + 1 }))).toThrow("versão mais nova");
    expect(() => parseBackup(JSON.stringify({ version: 2, results: [1, 2] }))).toThrow("corrompido");
  });

  it("leaves the database untouched when a row cannot be written", async () => {
    await seed();
    const broken = { version: BACKUP_VERSION, exportedAt: "", settings: null, results: [result("novo", 1)], practiceDays: [{ minutes: 3 }] };

    await expect(restoreBackup(broken)).rejects.toThrow();

    expect((await db.results.toArray()).map((row) => row.exerciseId).sort()).toEqual(["scales.1oct.69", "warmup.open.A"]);
  });
});

describe("resetProgress", () => {
  beforeEach(clearAll);

  it("clears results, days, achievements and Suzuki but keeps routines and imported music", async () => {
    await seed();
    await db.routines.add({ name: "Minha", origin: "propria", blocks: [] } as never);
    await db.achievements.put({ id: "first-run", unlockedAt: 1 } as never);
    await db.suzukiPieces.put({ key: "1:1", book: 1, name: "Twinkle", learnedAt: 1, lastReviewedAt: 1, reviewCount: 1 });

    await resetProgress();

    expect(await db.results.count()).toBe(0);
    expect(await db.practiceDays.count()).toBe(0);
    expect(await db.achievements.count()).toBe(0);
    expect(await db.suzukiPieces.count()).toBe(0);
    expect(await db.userStats.get("me")).toEqual(DEFAULT_USER_STATS);
    expect(await db.routines.count()).toBe(1);
    expect(await db.pieces.count()).toBe(1);
    expect(await db.recordings.count()).toBe(1);
  });
});
