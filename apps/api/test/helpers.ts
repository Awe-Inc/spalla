import type { FastifyInstance, LightMyRequestResponse } from "fastify";

import { buildApp } from "../src/app.js";
import { createAdmin } from "../src/auth/createAdmin.js";
import { loadConfig } from "../src/config.js";
import { pgliteDb, type Db } from "../src/db/db.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { memoryStore } from "../src/files/store.js";

export const PASSWORD = "senha-bem-longa-1";

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  close(): Promise<void>;
}

export async function makeApp(env: Record<string, string> = {}): Promise<TestApp> {
  const db = await pgliteDb();
  await runMigrations(db);
  await seed(db);
  const config = loadConfig({ NODE_ENV: "test", RATE_LIMIT_AUTH_MAX: "1000", RATE_LIMIT_MAX: "10000", ...env });
  const app = await buildApp({ db, config, files: memoryStore() });
  return {
    app,
    db,
    async close() {
      await app.close();
      await db.close();
    },
  };
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export function call(app: FastifyInstance, method: Method, url: string, token?: string | null, payload?: unknown): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

let counter = 0;

export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}@exemplo.com`;
}

export async function signup(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
): Promise<{ token: string; id: string; email: string; body: Record<string, unknown> }> {
  const email = (overrides.email as string | undefined) ?? uniqueEmail("aluno");
  const response = await call(app, "POST", "/auth/signup", null, {
    name: "Pessoa Teste",
    email,
    password: PASSWORD,
    accountType: "aluno",
    acceptTerms: true,
    ...overrides,
  });
  if (response.statusCode !== 201) throw new Error(`signup falhou: ${response.statusCode} ${response.body}`);
  const body = response.json();
  return { token: body.token, id: body.user.id, email, body };
}

export async function login(app: FastifyInstance, email: string, password = PASSWORD): Promise<string> {
  const response = await call(app, "POST", "/auth/login", null, { email, password });
  if (response.statusCode !== 200) throw new Error(`login falhou: ${response.statusCode} ${response.body}`);
  return response.json().token;
}

export async function adminToken(t: TestApp): Promise<{ token: string; id: string }> {
  const email = uniqueEmail("admin");
  await createAdmin(t.db, { email, name: "Admin", password: PASSWORD });
  const token = await login(t.app, email);
  const me = await call(t.app, "GET", "/auth/me", token);
  return { token, id: me.json().id };
}

export async function teacher(t: TestApp, admin: string): Promise<{ token: string; id: string }> {
  const account = await signup(t.app, { accountType: "professor", email: uniqueEmail("prof"), teacherBio: "Violinista" });
  const approved = await call(t.app, "POST", `/admin/teachers/${account.id}/approve`, admin);
  if (approved.statusCode !== 200) throw new Error(`aprovação falhou: ${approved.body}`);
  return { token: account.token, id: account.id };
}
