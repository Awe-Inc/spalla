import { loadConfig } from "../config.js";
import { pgliteDb, postgresDb } from "./db.js";
import { runMigrations } from "./migrate.js";
import { seed } from "./seed.js";

const config = loadConfig();
const db = config.databaseUrl ? postgresDb(config.databaseUrl) : await pgliteDb(config.pgliteDir);
try {
  const applied = await runMigrations(db);
  await seed(db);
  process.stdout.write(applied.length ? `Aplicadas: ${applied.join(", ")}\n` : "Banco já estava atualizado.\n");
} finally {
  await db.close();
}
