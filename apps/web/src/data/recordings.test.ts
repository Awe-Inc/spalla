import { describe, expect, it } from "vitest";

import { db, type StoredRecording } from "./db";
import {
  comparablePair,
  defaultRecordingName,
  formatClock,
  newestFirst,
  piecesSummary,
  pickRecordingMimeType,
  readRecordingPiece,
  recordedPieces,
  recorderPath,
  toggleCompared,
} from "./recordings";

function recording(id: number, pieceKey: string | null, createdAt: number, pieceTitle: string | null = pieceKey ? `Peça ${pieceKey}` : null): StoredRecording {
  return { id, name: `Gravação ${id}`, pieceKey, pieceTitle, mimeType: "audio/webm", durationMs: 60_000, sizeBytes: 1000, createdAt };
}

describe("pickRecordingMimeType", () => {
  it("prefers opus in webm and falls back to whatever the browser records", () => {
    expect(pickRecordingMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecordingMimeType((type) => type === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecordingMimeType(() => false)).toBeNull();
  });
});

describe("names and clock", () => {
  it("names a take after its piece and the moment it was played", () => {
    const date = new Date(2026, 9, 29, 8, 5);
    expect(defaultRecordingName(date, "Minueto em Sol")).toBe("Minueto em Sol - 29/10 08h05");
    expect(defaultRecordingName(date, null)).toBe("Gravação 29/10 08h05");
  });

  it("shows minutes and two-digit seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_400)).toBe("1:05");
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("recorder links", () => {
  it("carries the piece through the URL and back", () => {
    const path = recorderPath({ key: "biblioteca:bizet-adieux", title: "Adieux de l'hôtesse arabe" });
    const params = new URL(path, "http://localhost").searchParams;
    expect(path.startsWith("/ferramentas/gravador?")).toBe(true);
    expect(readRecordingPiece(params)).toEqual({ key: "biblioteca:bizet-adieux", title: "Adieux de l'hôtesse arabe" });
    expect(recorderPath()).toBe("/ferramentas/gravador");
  });

  it("ignores a link that names no piece", () => {
    expect(readRecordingPiece(new URLSearchParams("peca=repertoire.1"))).toBeNull();
    expect(readRecordingPiece(new URLSearchParams("peca=%20&titulo=X"))).toBeNull();
  });
});

describe("listing", () => {
  it("lists newest first and each recorded piece once, by title", () => {
    const list = [recording(1, "b", 10, "Bourrée"), recording(2, "a", 30, "Allegro"), recording(3, "b", 20, "Bourrée"), recording(4, null, 40)];
    expect(newestFirst(list).map((item) => item.id)).toEqual([4, 2, 3, 1]);
    expect(recordedPieces(list)).toEqual([
      { key: "a", title: "Allegro" },
      { key: "b", title: "Bourrée" },
    ]);
  });

  it("summarises recordings by piece, most recently recorded first", () => {
    const list = [recording(1, "b", 10, "Bourrée"), recording(2, null, 50), recording(3, "b", 20, "Bourrée")];
    expect(piecesSummary(list)).toEqual([
      { piece: null, count: 1, latestAt: 50 },
      { piece: { key: "b", title: "Bourrée" }, count: 2, latestAt: 20 },
    ]);
  });
});

describe("comparison", () => {
  it("keeps at most two selected and drops the oldest choice", () => {
    expect(toggleCompared([], 1)).toEqual([1]);
    expect(toggleCompared([1, 2], 3)).toEqual([2, 3]);
    expect(toggleCompared([1, 2], 1)).toEqual([2]);
  });

  it("pairs two takes of the same piece as before and after", () => {
    const list = [recording(1, "a", 30), recording(2, "a", 10), recording(3, "b", 20), recording(4, null, 5), recording(5, null, 6)];
    expect(comparablePair(list, [1, 2])?.map((item) => item.id)).toEqual([2, 1]);
    expect(comparablePair(list, [1, 3])).toBeNull();
    expect(comparablePair(list, [4, 5])).toBeNull();
    expect(comparablePair(list, [1])).toBeNull();
    expect(comparablePair(list, [1, 99])).toBeNull();
  });
});

describe("schema", () => {
  it("indexes recordings by piece so the detail page can find them", () => {
    expect(Object.keys(db.recordings.schema.idxByName)).toEqual(expect.arrayContaining(["pieceKey", "createdAt"]));
    expect(db.recordingFiles.schema.primKey.name).toBe("id");
  });
});
