import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { bearerToken, loadAuth } from "./auth/session.js";
import type { Config } from "./config.js";
import type { Db } from "./db/db.js";
import type { FileStore } from "./files/store.js";
import { AppError } from "./http/errors.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { fileRoutes } from "./routes/files.js";
import { studentRoutes } from "./routes/student.js";
import { teacherRoutes } from "./routes/teacher.js";

export interface AppContext {
  db: Db;
  config: Config;
  files: FileStore;
}

const BODY_LIMIT = 1024 * 1024;

const STATUS_MESSAGES: Record<number, { code: string; message: string }> = {
  413: { code: "grande-demais", message: "O arquivo ou o envio passou do tamanho permitido." },
  415: { code: "tipo-nao-aceito", message: "Esse tipo de envio não é aceito." },
  429: { code: "muitas-tentativas", message: "Muitas tentativas seguidas. Espere um minuto e tente de novo." },
};

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const { config } = ctx;
  const app = Fastify({
    logger: config.env === "test" ? false : { level: "info" },
    trustProxy: config.trustProxy,
    bodyLimit: BODY_LIMIT,
  });

  app.decorateRequest("auth", null);
  await app.register(helmet, { crossOriginResourcePolicy: { policy: "cross-origin" } });
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["Content-Disposition"],
    maxAge: 600,
  });
  await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: config.maxPdfBytes, files: 1, fields: 10, fieldSize: 10_000 } });

  app.addHook("onRequest", async (request) => {
    request.auth = await loadAuth(ctx.db, bearerToken(request));
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError) {
      const fields = Object.fromEntries(error.issues.map((issue) => [issue.path.join("."), issue.message]));
      return reply.code(400).send({ error: { code: "dados-invalidos", message: error.issues[0]?.message ?? "Dados inválidos.", fields } });
    }
    const status = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    if (status >= 500) {
      request.log.error(error);
      return reply.code(500).send({ error: { code: "erro-interno", message: "Algo deu errado do nosso lado. Tente de novo em instantes." } });
    }
    const known = STATUS_MESSAGES[status] ?? { code: "requisicao-invalida", message: "Não foi possível entender o pedido." };
    return reply.code(status).send({ error: known });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: "nao-encontrado", message: "Rota não encontrada." } }));

  app.get("/health", async () => {
    await ctx.db.query("SELECT 1");
    return { ok: true };
  });

  await authRoutes(app, ctx);
  await adminRoutes(app, ctx);
  await teacherRoutes(app, ctx);
  await studentRoutes(app, ctx);
  await fileRoutes(app, ctx);
  return app;
}
