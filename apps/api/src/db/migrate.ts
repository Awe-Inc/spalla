import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Db } from "./db.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));

export async function runMigrations(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).map((row) => row.name));
  const pending = (await readdir(dir)).filter((name) => name.endsWith(".sql") && !applied.has(name)).sort();
  for (const name of pending) {
    const sql = await readFile(join(dir, name), "utf8");
    await db.transaction(async (tx) => {
      for (const statement of splitStatements(sql)) await tx.query(statement);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
  }
  return pending;
}

export function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}
