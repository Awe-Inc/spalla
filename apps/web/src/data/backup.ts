import { db, DEFAULT_USER_STATS } from "./db";

export const BACKUP_VERSION = 1;

interface Backup {
  version: number;
  exportedAt: string;
  results: unknown[];
  routines: unknown[];
  practiceDays: unknown[];
  settings: unknown[];
  userStats: unknown[];
  achievements: unknown[];
  lessonTasks: unknown[];
  pieces: { count: number };
}

export async function buildBackup(): Promise<Backup> {
  const [results, routines, practiceDays, settings, userStats, achievements, lessonTasks, pieceCount] = await Promise.all([
    db.results.toArray(),
    db.routines.toArray(),
    db.practiceDays.toArray(),
    db.settings.toArray(),
    db.userStats.toArray(),
    db.achievements.toArray(),
    db.lessonTasks.toArray(),
    db.pieces.count(),
  ]);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    results,
    routines,
    practiceDays,
    settings,
    userStats,
    achievements,
    lessonTasks,
    pieces: { count: pieceCount },
  };
}

export function backupFileName(now = new Date()): string {
  return `fretless-backup-${now.toISOString().slice(0, 10)}.json`;
}

export function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportBackup(): Promise<void> {
  const backup = await buildBackup();
  downloadText(backupFileName(), JSON.stringify(backup, null, 2));
}

export async function resetProgress(): Promise<void> {
  await db.transaction("rw", db.results, db.practiceDays, db.userStats, db.achievements, async () => {
    await Promise.all([db.results.clear(), db.practiceDays.clear(), db.achievements.clear()]);
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
