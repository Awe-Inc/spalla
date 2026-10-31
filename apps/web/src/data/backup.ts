import type { Table } from "dexie";

import { db, DEFAULT_USER_STATS } from "./db";

export const BACKUP_VERSION = 2;

const SETTINGS_STORAGE_KEY = "fretless-settings";
const BYTES_MARKER = "$bytes";
const BASE64_CHUNK = 0x8000;

export const BACKUP_TABLES = [
  "results",
  "routines",
  "practiceDays",
  "userStats",
  "achievements",
  "lessonTasks",
  "suzukiPieces",
  "pieceSections",
  "sectionRuns",
  "pieces",
  "sheets",
  "sheetFiles",
  "recordings",
  "recordingFiles",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type Backup = {
  version: number;
  exportedAt: string;
  settings: string | null;
} & Partial<Record<BackupTable, unknown[]>>;

export interface RestoreSummary {
  rows: number;
  tables: number;
  settings: boolean;
}

export class BackupFormatError extends Error {}

function tableOf(name: BackupTable): Table<unknown, unknown> {
  return db.table(name);
}

function readStoredSettings(): string | null {
  try {
    return localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isBytes(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === "[object Uint8Array]";
}

function encodeBytes(_key: string, value: unknown): unknown {
  return isBytes(value) ? { [BYTES_MARKER]: bytesToBase64(value) } : value;
}

function decodeBytes(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const encoded = (value as Record<string, unknown>)[BYTES_MARKER];
    if (typeof encoded === "string" && Object.keys(value).length === 1) return base64ToBytes(encoded);
  }
  return value;
}

export async function buildBackup(): Promise<Backup> {
  const rows = await Promise.all(BACKUP_TABLES.map((name) => tableOf(name).toArray()));
  const tables = Object.fromEntries(BACKUP_TABLES.map((name, index) => [name, rows[index]])) as Record<BackupTable, unknown[]>;
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: readStoredSettings(), ...tables };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, encodeBytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, decodeBytes);
  } catch {
    throw new BackupFormatError("Esse arquivo não é um backup do Spalla.");
  }
  if (!isRecord(parsed) || typeof parsed.version !== "number") throw new BackupFormatError("Esse arquivo não é um backup do Spalla.");
  if (parsed.version > BACKUP_VERSION) throw new BackupFormatError("Esse backup veio de uma versão mais nova do Spalla. Atualize o app e tente de novo.");
  if (parsed.version < 1) throw new BackupFormatError("Esse arquivo não é um backup do Spalla.");
  const backup: Backup = {
    version: parsed.version,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    settings: typeof parsed.settings === "string" ? parsed.settings : null,
  };
  for (const name of BACKUP_TABLES) {
    const rows = parsed[name];
    if (rows === undefined || isRecord(rows)) continue;
    if (!Array.isArray(rows) || !rows.every(isRecord)) throw new BackupFormatError("O backup está corrompido: confira se é o arquivo inteiro.");
    backup[name] = rows;
  }
  return backup;
}

export async function restoreBackup(backup: Backup): Promise<RestoreSummary> {
  const present = BACKUP_TABLES.filter((name) => backup[name] !== undefined);
  if (present.length > 0) {
    await db.transaction("rw", present.map(tableOf), async () => {
      for (const name of present) {
        const table = tableOf(name);
        await table.clear();
        await table.bulkPut(backup[name] ?? []);
      }
    });
  }
  const hasSettings = backup.settings !== null && restoreSettings(backup.settings);
  return { rows: present.reduce((total, name) => total + (backup[name]?.length ?? 0), 0), tables: present.length, settings: hasSettings };
}

function restoreSettings(settings: string): boolean {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, settings);
    return true;
  } catch {
    return false;
  }
}

export function restoreSentence(summary: RestoreSummary): string {
  const settings = summary.settings ? " As configurações também voltaram." : "";
  return `Backup restaurado: ${summary.rows} ${summary.rows === 1 ? "registro" : "registros"}.${settings}`;
}

export function backupFileName(now = new Date()): string {
  return `spalla-backup-${now.toISOString().slice(0, 10)}.json`;
}

const REVOKE_URL_DELAY_MS = 10_000;

export function downloadText(fileName: string, text: string): void {
  downloadBlob(fileName, new Blob([text], { type: "application/json" }));
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_URL_DELAY_MS);
}

export async function exportBackup(): Promise<void> {
  const backup = await buildBackup();
  downloadText(backupFileName(), serializeBackup(backup));
}

export async function resetProgress(): Promise<void> {
  await db.transaction("rw", [db.results, db.sectionRuns, db.practiceDays, db.userStats, db.achievements, db.suzukiPieces], async () => {
    await Promise.all([db.results.clear(), db.sectionRuns.clear(), db.practiceDays.clear(), db.achievements.clear(), db.suzukiPieces.clear()]);
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
