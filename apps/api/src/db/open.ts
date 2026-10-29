import type { Config } from "../config.js";
import { type Db, pgliteDb, postgresDb } from "./db.js";
import { runMigrations } from "./migrate.js";
import { seed } from "./seed.js";

export async function openDatabase(config: Config): Promise<Db> {
  const db = config.databaseUrl ? postgresDb(config.databaseUrl) : await pgliteDb(config.pgliteDir);
  await runMigrations(db);
  await seed(db);
  return db;
}
