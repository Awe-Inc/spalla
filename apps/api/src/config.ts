import { z } from "zod";

const booleanFlag = z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1");

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3400),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default(".data/pglite"),
  FILES_DIR: z.string().default(".data/files"),
  FILES_STORE: z.enum(["disk", "database"]).default("disk"),
  CORS_ORIGINS: z.string().default("http://localhost:5180,http://127.0.0.1:5180"),
  TRUST_PROXY: booleanFlag.default(false),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),
  MAX_PDF_MB: z.coerce.number().int().min(1).max(100).default(20),
});

export interface Config {
  env: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string | undefined;
  pgliteDir: string;
  filesDir: string;
  filesStore: "disk" | "database";
  corsOrigins: string[];
  trustProxy: boolean;
  rateLimitMax: number;
  rateLimitAuthMax: number;
  maxPdfBytes: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = configSchema.parse(env);
  if (parsed.NODE_ENV === "production" && !parsed.DATABASE_URL) {
    throw new Error("DATABASE_URL é obrigatório em produção");
  }
  return {
    env: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    pgliteDir: parsed.PGLITE_DIR,
    filesDir: parsed.FILES_DIR,
    filesStore: parsed.FILES_STORE,
    corsOrigins: parsed.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    trustProxy: parsed.TRUST_PROXY,
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    rateLimitAuthMax: parsed.RATE_LIMIT_AUTH_MAX,
    maxPdfBytes: parsed.MAX_PDF_MB * 1024 * 1024,
  };
}
