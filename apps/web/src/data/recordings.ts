import { db, type StoredRecording } from "./db";

export const MAX_RECORDING_MS = 15 * 60 * 1000;
export const RECORDING_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"] as const;
export const PIECE_PARAM = "peca";
export const PIECE_TITLE_PARAM = "titulo";
export const COMPARED_RECORDINGS = 2;

const RECORDER_PATH = "/ferramentas/gravador";

export interface RecordingPiece {
  key: string;
  title: string;
}

export interface NewRecording {
  bytes: Uint8Array;
  mimeType: string;
  durationMs: number;
  name: string;
  piece: RecordingPiece | null;
}

export function pickRecordingMimeType(isSupported: (mimeType: string) => boolean): string | null {
  return RECORDING_MIME_TYPES.find((mimeType) => isSupported(mimeType)) ?? null;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export function defaultRecordingName(date: Date, pieceTitle: string | null): string {
  const stamp = `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)} ${twoDigits(date.getHours())}h${twoDigits(date.getMinutes())}`;
  return pieceTitle ? `${pieceTitle} - ${stamp}` : `Gravação ${stamp}`;
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${twoDigits(totalSeconds % 60)}`;
}

export function recorderPath(piece: RecordingPiece | null = null): string {
  if (!piece) return RECORDER_PATH;
  const params = new URLSearchParams({ [PIECE_PARAM]: piece.key, [PIECE_TITLE_PARAM]: piece.title });
  return `${RECORDER_PATH}?${params.toString()}`;
}

export function readRecordingPiece(params: URLSearchParams): RecordingPiece | null {
  const key = params.get(PIECE_PARAM)?.trim();
  const title = params.get(PIECE_TITLE_PARAM)?.trim();
  return key && title ? { key, title } : null;
}

export function newestFirst(recordings: readonly StoredRecording[]): StoredRecording[] {
  return [...recordings].sort((a, b) => b.createdAt - a.createdAt);
}

export function recordedPieces(recordings: readonly StoredRecording[]): RecordingPiece[] {
  const titles = new Map<string, string>();
  for (const recording of recordings) {
    if (recording.pieceKey && recording.pieceTitle && !titles.has(recording.pieceKey)) titles.set(recording.pieceKey, recording.pieceTitle);
  }
  return [...titles].map(([key, title]) => ({ key, title })).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

export function toggleCompared(selected: readonly number[], id: number): number[] {
  if (selected.includes(id)) return selected.filter((existing) => existing !== id);
  return [...selected, id].slice(-COMPARED_RECORDINGS);
}

export function comparablePair(recordings: readonly StoredRecording[], selected: readonly number[]): [StoredRecording, StoredRecording] | null {
  if (selected.length !== COMPARED_RECORDINGS) return null;
  const chosen = selected.map((id) => recordings.find((recording) => recording.id === id));
  const [first, second] = chosen;
  if (!first || !second || first.pieceKey === null || first.pieceKey !== second.pieceKey) return null;
  return first.createdAt <= second.createdAt ? [first, second] : [second, first];
}

export async function saveRecording(recording: NewRecording, now = Date.now()): Promise<number> {
  return db.transaction("rw", db.recordings, db.recordingFiles, async () => {
    const id = (await db.recordings.add({
      name: recording.name.trim() || defaultRecordingName(new Date(now), recording.piece?.title ?? null),
      pieceKey: recording.piece?.key ?? null,
      pieceTitle: recording.piece?.title ?? null,
      mimeType: recording.mimeType,
      durationMs: recording.durationMs,
      sizeBytes: recording.bytes.byteLength,
      createdAt: now,
    })) as number;
    await db.recordingFiles.put({ id, bytes: recording.bytes });
    return id;
  });
}

export async function renameRecording(id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed) await db.recordings.update(id, { name: trimmed });
}

export async function removeRecording(id: number): Promise<void> {
  await db.transaction("rw", db.recordings, db.recordingFiles, async () => {
    await db.recordings.delete(id);
    await db.recordingFiles.delete(id);
  });
}

export async function readRecordingBlob(id: number | undefined, mimeType: string): Promise<Blob | null> {
  if (id === undefined) return null;
  const file = await db.recordingFiles.get(id);
  return file ? new Blob([new Uint8Array(file.bytes)], { type: mimeType }) : null;
}

export interface PieceRecordingSummary {
  piece: RecordingPiece | null;
  count: number;
  latestAt: number;
}

export function piecesSummary(recordings: readonly StoredRecording[]): PieceRecordingSummary[] {
  const byKey = new Map<string | null, PieceRecordingSummary>();
  for (const recording of recordings) {
    const piece = recording.pieceKey && recording.pieceTitle ? { key: recording.pieceKey, title: recording.pieceTitle } : null;
    const key = piece?.key ?? null;
    const current = byKey.get(key);
    byKey.set(key, {
      piece: current?.piece ?? piece,
      count: (current?.count ?? 0) + 1,
      latestAt: Math.max(current?.latestAt ?? 0, recording.createdAt),
    });
  }
  return [...byKey.values()].sort((a, b) => b.latestAt - a.latestAt);
}
