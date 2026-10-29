import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { pgliteDb } from "../src/db/db.js";

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("pgliteDb", () => {
  it("opens a data dir whose parent folders do not exist yet, as on a fresh checkout", async () => {
    const root = await mkdtemp(join(tmpdir(), "fretless-db-"));
    roots.push(root);
    const db = await pgliteDb(join(root, ".data", "pglite"));
    const [row] = await db.query<{ ok: number }>("SELECT 1 AS ok");
    await db.close();
    expect(row?.ok).toBe(1);
  }, 30000);
});
