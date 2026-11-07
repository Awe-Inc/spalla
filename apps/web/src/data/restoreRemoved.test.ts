import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { db, type Routine, type StoredPiece, type StoredRecording, type StoredSheet } from "./db";
import { removePiece } from "./importPiece";
import { removeRecording } from "./recordings";
import { removeRoutine } from "./routines";
import { removeSheet } from "./sheets";

const BYTES = new Uint8Array([1, 2, 3]);

beforeEach(async () => {
  await Promise.all([db.sheets.clear(), db.sheetFiles.clear(), db.recordings.clear(), db.recordingFiles.clear(), db.pieces.clear(), db.pieceFiles.clear(), db.routines.clear()]);
});

describe("removals that can be undone", () => {
  it("brings a sheet back with its PDF", async () => {
    const sheet = { id: 7, title: "Bach" } as unknown as StoredSheet;
    await db.sheets.put(sheet);
    await db.sheetFiles.put({ id: 7, bytes: BYTES });
    const restore = await removeSheet(7);
    expect(await db.sheets.get(7)).toBeUndefined();
    expect(await db.sheetFiles.get(7)).toBeUndefined();
    await restore();
    expect(await db.sheets.get(7)).toMatchObject({ title: "Bach" });
    expect(await db.sheetFiles.get(7)).toBeDefined();
  });

  it("brings a recording back with its audio", async () => {
    await db.recordings.put({ id: 8, name: "Ensaio" } as unknown as StoredRecording);
    await db.recordingFiles.put({ id: 8, bytes: BYTES });
    const restore = await removeRecording(8);
    expect(await db.recordings.get(8)).toBeUndefined();
    expect(await db.recordingFiles.get(8)).toBeUndefined();
    await restore();
    expect(await db.recordings.get(8)).toMatchObject({ name: "Ensaio" });
    expect(await db.recordingFiles.get(8)).toBeDefined();
  });

  it("brings a piece back with its file", async () => {
    await db.pieces.put({ id: 9, title: "Minueto" } as unknown as StoredPiece);
    await db.pieceFiles.put({ id: 9, bytes: BYTES });
    const restore = await removePiece(9);
    expect(await db.pieces.get(9)).toBeUndefined();
    expect(await db.pieceFiles.get(9)).toBeUndefined();
    await restore();
    expect(await db.pieces.get(9)).toMatchObject({ title: "Minueto" });
    expect(await db.pieceFiles.get(9)).toBeDefined();
  });

  it("brings a routine back", async () => {
    await db.routines.put({ id: 10, name: "Manhã" } as unknown as Routine);
    const restore = await removeRoutine(10);
    expect(await db.routines.get(10)).toBeUndefined();
    await restore();
    expect(await db.routines.get(10)).toMatchObject({ name: "Manhã" });
  });
});
