import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface FileStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const KEY_PATTERN = /^[a-f0-9]{32}$/;

export function newStorageKey(): string {
  return randomBytes(16).toString("hex");
}

function checkedKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error("chave de arquivo inválida");
  return key;
}

export function diskStore(dir: string): FileStore {
  const ready = mkdir(dir, { recursive: true });
  return {
    async put(key, data) {
      await ready;
      await writeFile(join(dir, checkedKey(key)), data, { flag: "wx" });
    },
    async get(key) {
      return readFile(join(dir, checkedKey(key)));
    },
    async remove(key) {
      await rm(join(dir, checkedKey(key)), { force: true });
    },
  };
}

export function memoryStore(): FileStore {
  const files = new Map<string, Buffer>();
  return {
    async put(key, data) {
      files.set(checkedKey(key), data);
    },
    async get(key) {
      const data = files.get(checkedKey(key));
      if (!data) throw new Error("arquivo não encontrado");
      return data;
    },
    async remove(key) {
      files.delete(checkedKey(key));
    },
  };
}

export const PDF_MAGIC = Buffer.from("%PDF-");

export function isPdf(data: Buffer): boolean {
  return data.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}
