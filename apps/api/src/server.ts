import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/open.js";
import { databaseStore, diskStore } from "./files/store.js";

const config = loadConfig();
const db = await openDatabase(config);
const app = await buildApp({ db, config, files: config.filesStore === "database" ? databaseStore(db) : diskStore(config.filesDir) });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "encerrando");
  await app.close();
  await db.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.host, port: config.port });
