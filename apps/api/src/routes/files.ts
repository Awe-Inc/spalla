import type { FastifyInstance } from "fastify";

import type { AppContext } from "../app.js";
import { requireAuth } from "../auth/session.js";
import { notFound } from "../http/errors.js";
import { idParams } from "../http/schemas.js";
import { STUDENT_MATERIAL_IDS } from "./access.js";

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function fileRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db } = ctx;

  app.get("/files/:id", async (request, reply) => {
    const me = requireAuth(request);
    const { id } = idParams.parse(request.params);
    const [file] = await db.query<{ name: string; mime_type: string; storage_key: string }>(
      `SELECT f.name, f.mime_type, f.storage_key FROM files f
       WHERE f.id = $2 AND (
         f.owner_id = $1
         OR EXISTS (SELECT 1 FROM materials m WHERE m.file_id = f.id AND m.id IN (${STUDENT_MATERIAL_IDS})))`,
      [me.id, id],
    );
    if (!file) throw notFound("Arquivo não encontrado.");
    const data = await ctx.files.get(file.storage_key).catch((error: unknown) => {
      request.log.error(error);
      throw notFound("Arquivo não encontrado.");
    });
    return reply
      .header("Content-Type", file.mime_type)
      .header("Content-Disposition", contentDisposition(file.name))
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(data);
  });
}
