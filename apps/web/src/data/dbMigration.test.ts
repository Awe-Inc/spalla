import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { FretlessDatabase } from "./db";

const NAME = "fretless-migration";

function versionFour(): Dexie {
  const legacy = new Dexie(NAME);
  legacy.version(1).stores({ results: "++id, exerciseId, playedAt", routines: "++id, name, origin", practiceDays: "day", settings: "key" });
  legacy.version(2).stores({
    results: "++id, exerciseId, playedAt",
    routines: "++id, name, origin",
    practiceDays: "day",
    settings: "key",
    userStats: "key",
    achievements: "id",
    lessonTasks: "++id, createdAt, doneAt",
    pieces: "++id, fileName, title, composer, genre, level",
  });
  legacy.version(3).stores({ pieces: "++id, fileName, title, composer, genre, level, importedAt" });
  legacy.version(4).stores({ sheets: "++id, fileName, title, importedAt, openedAt", sheetFiles: "id" });
  return legacy;
}

describe("Dexie migration", () => {
  afterEach(async () => {
    await Dexie.delete(NAME);
  });

  it("opens a version 4 database without losing what the player had", async () => {
    const legacy = versionFour();
    await legacy.table("results").add({ exerciseId: "scales.1oct.69", playedAt: 1, accuracyPct: 88, meanSignedCents: 2, bpm: 60, stars: 2, durationSeconds: 30 });
    await legacy.table("practiceDays").put({ day: "2026-09-01", minutes: 12, exercisesPlayed: 3 });
    await legacy.table("userStats").put({ key: "me", xp: 250, dailyGoalXp: 60, frozenDays: [], loopsCompleted: 0 });
    await legacy.table("pieces").add({ fileName: "minueto.mxl", title: "Minueto", composer: "Bach", genre: "", level: 3, bytes: new Uint8Array([1, 2]), noteCount: 4, beatsPerMinute: 90, importedAt: 2 });
    const sheetId = await legacy.table("sheets").add({ fileName: "a.pdf", title: "A", pageCount: 2, lastPage: 1, importedAt: 3, openedAt: 3 });
    await legacy.table("sheetFiles").put({ id: sheetId, bytes: new Uint8Array([37]) });
    await legacy.table("settings").put({ key: "theme", value: "dark" });
    legacy.close();

    const current = new FretlessDatabase(NAME);
    await current.open();

    expect(current.verno).toBe(10);
    expect(current.tables.map((table) => table.name)).not.toContain("settings");
    expect(current.tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(["suzukiPieces", "pieceSections", "recordings", "recordingFiles", "classAssignments", "classAnnouncements"]),
    );
    expect(await current.results.where("exerciseId").equals("scales.1oct.69").count()).toBe(1);
    expect(await current.practiceDays.get("2026-09-01")).toMatchObject({ minutes: 12 });
    expect((await current.userStats.get("me"))?.xp).toBe(250);
    expect(await current.pieces.where("fileName").equals("minueto.mxl").count()).toBe(1);
    expect(await current.sheetFiles.get(sheetId as number)).toBeDefined();
    expect(await current.recordings.count()).toBe(0);
    current.close();
  });
});
