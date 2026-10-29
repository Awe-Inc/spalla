import { db, DEFAULT_USER_STATS } from "./db";

export const BACKUP_VERSION = 1;

interface Backup {
  version: number;
  exportedAt: string;
  results: unknown[];
  routines: unknown[];
  practiceDays: unknown[];
  userStats: unknown[];
  achievements: unknown[];
  lessonTasks: unknown[];
  suzukiPieces: unknown[];
  pieceSections: unknown[];
  pieces: { count: number };
}

export async function buildBackup(): Promise<Backup> {
  const [results, routines, practiceDays, userStats, achievements, lessonTasks, suzukiPieces, pieceSections, pieceCount] = await Promise.all([
    db.results.toArray(),
    db.routines.toArray(),
    db.practiceDays.toArray(),
    db.userStats.toArray(),
    db.achievements.toArray(),
    db.lessonTasks.toArray(),
    db.suzukiPieces.toArray(),
    db.pieceSections.toArray(),
    db.pieces.count(),
  ]);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    results,
    routines,
    practiceDays,
    userStats,
    achievements,
    lessonTasks,
    suzukiPieces,
    pieceSections,
    pieces: { count: pieceCount },
  };
}

export function backupFileName(now = new Date()): string {
  return `fretless-backup-${now.toISOString().slice(0, 10)}.json`;
}

const REVOKE_URL_DELAY_MS = 10_000;

export function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_URL_DELAY_MS);
}

export async function exportBackup(): Promise<void> {
  const backup = await buildBackup();
  downloadText(backupFileName(), JSON.stringify(backup, null, 2));
}

export async function resetProgress(): Promise<void> {
  await db.transaction("rw", [db.results, db.practiceDays, db.userStats, db.achievements, db.suzukiPieces], async () => {
    await Promise.all([db.results.clear(), db.practiceDays.clear(), db.achievements.clear(), db.suzukiPieces.clear()]);
    await db.userStats.put({ ...DEFAULT_USER_STATS });
  });
}

export async function clearAppCache(): Promise<void> {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}
