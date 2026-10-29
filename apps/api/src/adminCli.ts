import { parseArgs } from "node:util";

import { createAdmin } from "./auth/createAdmin.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/open.js";

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
const email = values.email ?? process.env.ADMIN_EMAIL;
const name = values.name ?? process.env.ADMIN_NAME ?? "Administração";
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  process.stderr.write("Use: ADMIN_PASSWORD=... pnpm admin:create --email voce@exemplo.com [--name Nome]\n");
  process.exit(1);
}
const db = await openDatabase(loadConfig());
try {
  const outcome = await createAdmin(db, { email, name, password });
  process.stdout.write(`Admin ${outcome}: ${email}\n`);
} finally {
  await db.close();
}
