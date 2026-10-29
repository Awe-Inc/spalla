import { api } from "@/api/client";
import type { PracticeUpload, PracticeUploadResult } from "@/api/types";
import { db, type ExerciseResult } from "@/data/db";

export const SYNC_BATCH_SIZE = 500;
const DEVICE_KEY = "fretless-dispositivo";
const CURSOR_PREFIX = "fretless-sync-";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function deviceId(): string {
  const existing = readStorage(DEVICE_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  writeStorage(DEVICE_KEY, fresh);
  return fresh;
}

export function lastSyncedResultId(userId: string): number {
  const value = Number(readStorage(`${CURSOR_PREFIX}${userId}`));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function toPracticeUpload(result: ExerciseResult & { id: number }, device: string): PracticeUpload {
  return {
    clientId: `${device}:${result.id}`,
    exerciseId: result.exerciseId,
    playedAt: new Date(result.playedAt).toISOString(),
    accuracyPct: Math.min(100, Math.max(0, result.accuracyPct)),
    meanSignedCents: Math.min(1200, Math.max(-1200, result.meanSignedCents)),
    bpm: Math.min(400, Math.max(10, Math.round(result.bpm))),
    stars: result.stars,
    durationSeconds: Math.min(4 * 60 * 60, Math.max(0, result.durationSeconds)),
  };
}

export interface SyncOutcome {
  sent: number;
  inserted: number;
}

export async function syncPractice(userId: string): Promise<SyncOutcome> {
  const device = deviceId();
  let cursor = lastSyncedResultId(userId);
  let sent = 0;
  let inserted = 0;
  for (;;) {
    const batch = (await db.results.where("id").above(cursor).limit(SYNC_BATCH_SIZE).toArray()).filter(
      (result): result is ExerciseResult & { id: number } => typeof result.id === "number",
    );
    if (batch.length === 0) break;
    const response = await api.post<PracticeUploadResult>("/me/practice", { results: batch.map((result) => toPracticeUpload(result, device)) });
    sent += response.received;
    inserted += response.inserted;
    cursor = batch[batch.length - 1]!.id;
    writeStorage(`${CURSOR_PREFIX}${userId}`, String(cursor));
    if (batch.length < SYNC_BATCH_SIZE) break;
  }
  return { sent, inserted };
}
