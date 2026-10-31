import { db, type StoredSheet } from "./db";
import { describeStorageError } from "./storageErrors";

export const MAX_SHEET_FILE_BYTES = 64 * 1024 * 1024;
const PDF_MIME = "application/pdf";
const PDF_MAGIC = "%PDF";
const PDF_HEADER_WINDOW = 1024;

export type SheetImportOutcome = { ok: true; sheet: StoredSheet } | { ok: false; error: string };

export function isPdfFile(file: { name: string; type: string }): boolean {
  return file.type === PDF_MIME || /\.pdf$/i.test(file.name);
}

export function hasPdfHeader(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.subarray(0, PDF_HEADER_WINDOW));
  return head.includes(PDF_MAGIC);
}

export function sheetTitle(fileName: string): string {
  const stem = fileName.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
  return stem.length > 0 ? stem : fileName;
}

export function clampPage(page: number, pageCount: number): number {
  if (pageCount <= 0) return 1;
  return Math.min(pageCount, Math.max(1, Math.round(page) || 1));
}

export function describeSizeError(sizeBytes: number): string {
  return `O arquivo tem ${Math.round(sizeBytes / 1024 / 1024)} MB; o limite é ${MAX_SHEET_FILE_BYTES / 1024 / 1024} MB.`;
}

export function describeSheetStorageError(cause: unknown): string {
  return describeStorageError(cause, "esse PDF");
}

export function pageCountLabel(pageCount: number): string {
  return pageCount === 1 ? "1 página" : `${pageCount} páginas`;
}

export async function importSheetFile(file: File, countPages: (bytes: Uint8Array) => Promise<number>): Promise<SheetImportOutcome> {
  if (!isPdfFile(file)) return { ok: false, error: "A estante só abre PDF." };
  if (file.size > MAX_SHEET_FILE_BYTES) return { ok: false, error: describeSizeError(file.size) };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Não deu para ler esse arquivo. Tente copiá-lo de novo." };
  }
  if (!hasPdfHeader(bytes)) return { ok: false, error: "Esse arquivo não é um PDF válido." };
  let pageCount: number;
  try {
    pageCount = await countPages(bytes);
  } catch {
    return { ok: false, error: "O PDF não abriu. Ele pode estar protegido ou corrompido." };
  }
  if (pageCount < 1) return { ok: false, error: "O PDF não tem páginas." };
  const sheet = await db.transaction("rw", db.sheets, db.sheetFiles, async () => {
    const now = Date.now();
    const existing = await db.sheets.where("fileName").equals(file.name).first();
    const next: StoredSheet = {
      fileName: file.name,
      title: existing?.title ?? sheetTitle(file.name),
      pageCount,
      lastPage: clampPage(existing?.lastPage ?? 1, pageCount),
      importedAt: now,
      openedAt: existing?.openedAt ?? now,
    };
    const id = existing?.id !== undefined ? ((await db.sheets.put({ ...next, id: existing.id })) as number) : ((await db.sheets.add(next)) as number);
    await db.sheetFiles.put({ id, bytes });
    return { ...next, id };
  });
  return { ok: true, sheet };
}

export async function removeSheet(id: number): Promise<void> {
  await db.transaction("rw", db.sheets, db.sheetFiles, async () => {
    await db.sheets.delete(id);
    await db.sheetFiles.delete(id);
  });
}

export async function rememberSheetPage(id: number, lastPage: number): Promise<void> {
  await db.sheets.update(id, { lastPage, openedAt: Date.now() });
}

export async function touchSheet(id: number): Promise<void> {
  await db.sheets.update(id, { openedAt: Date.now() });
}

export async function readSheetBytes(id: number): Promise<Uint8Array | null> {
  return (await db.sheetFiles.get(id))?.bytes ?? null;
}
