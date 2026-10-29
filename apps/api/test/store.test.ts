import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pgliteDb, type Db } from "../src/db/db.js";
import { runMigrations } from "../src/db/migrate.js";
import { databaseStore, newStorageKey } from "../src/files/store.js";

let db: Db;

beforeAll(async () => {
  db = await pgliteDb();
  await runMigrations(db);
});

afterAll(async () => {
  await db.close();
});

describe("databaseStore", () => {
  it("keeps the PDF bytes in Postgres, so a host with a throwaway disk does not lose them", async () => {
    const store = databaseStore(db);
    const key = newStorageKey();
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0x10]);
    await store.put(key, bytes);
    const read = await store.get(key);
    expect(Buffer.isBuffer(read)).toBe(true);
    expect(read.equals(bytes)).toBe(true);
    await store.remove(key);
    await expect(store.get(key)).rejects.toThrow();
  });

  it("refuses a key that is not a storage key", async () => {
    await expect(databaseStore(db).get("../etc/passwd")).rejects.toThrow();
  });
});
