import { mkdir } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export interface Queryable {
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<Row[]>;
}

export interface Db extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function postgresDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });
  return {
    async query<Row>(text: string, params: unknown[] = []) {
      return (await pool.query(text, params)).rows as Row[];
    },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work({ query: async <Row>(text: string, params: unknown[] = []) => (await client.query(text, params)).rows as Row[] });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function pgliteDb(dataDir?: string): Promise<Db> {
  if (dataDir && !dataDir.includes("://")) await mkdir(dataDir, { recursive: true });
  const lite = await PGlite.create(dataDir);
  return {
    async query<Row>(text: string, params: unknown[] = []) {
      return (await lite.query<Row>(text, params)).rows;
    },
    transaction: (work) => lite.transaction((tx) => work({ query: async <Row>(text: string, params: unknown[] = []) => (await tx.query<Row>(text, params)).rows })),
    close: () => lite.close(),
  };
}
