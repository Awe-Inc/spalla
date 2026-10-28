import type { FretlessCore } from "@fretless/core";

import { db, type StoredPiece } from "./db";
import { IMPORTED_GENRE, levelFromNoteCount } from "./pieces";

export const MAX_PIECE_FILE_BYTES = 8 * 1024 * 1024;
export const PARSE_OPTIONS = { expandRepeats: true, trimSilentIntro: true, mergeTies: true } as const;

export type ImportOutcome = { ok: true; piece: StoredPiece } | { ok: false; error: string };

export async function importPieceFile(core: FretlessCore, file: File): Promise<ImportOutcome> {
  if (file.size > MAX_PIECE_FILE_BYTES) {
    return { ok: false, error: `O arquivo tem ${Math.round(file.size / 1024 / 1024)} MB; o limite é ${MAX_PIECE_FILE_BYTES / 1024 / 1024} MB.` };
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Não deu para ler esse arquivo. Tente exportar de novo." };
  }
  const parsed = core.parseMusicXml(bytes, PARSE_OPTIONS);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const piece: StoredPiece = {
    fileName: file.name,
    title: parsed.score.title,
    composer: parsed.score.composer,
    genre: IMPORTED_GENRE,
    level: levelFromNoteCount(parsed.score.noteCount, parsed.score.beatsPerMinute),
    bytes,
    noteCount: parsed.score.noteCount,
    beatsPerMinute: Math.round(parsed.score.beatsPerMinute),
    importedAt: Date.now(),
  };
  const existing = await db.pieces.where("fileName").equals(file.name).first();
  const id = existing?.id !== undefined ? ((await db.pieces.put({ ...piece, id: existing.id })) as number) : ((await db.pieces.add(piece)) as number);
  return { ok: true, piece: { ...piece, id } };
}

export async function removePiece(id: number): Promise<void> {
  await db.pieces.delete(id);
}
