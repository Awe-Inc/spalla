import type { FastifyRequest } from "fastify";

import type { Queryable } from "../db/db.js";

export interface AuditTarget {
  type: string;
  id: string;
}

export async function audit(
  db: Queryable,
  request: FastifyRequest,
  action: string,
  target: AuditTarget | null = null,
  data: Record<string, unknown> = {},
  actorId: string | null = request.auth?.id ?? null,
): Promise<void> {
  await db.query("INSERT INTO audit_log (actor_id, action, target_type, target_id, data, ip) VALUES ($1, $2, $3, $4, $5::jsonb, $6)", [
    actorId,
    action,
    target?.type ?? null,
    target?.id ?? null,
    JSON.stringify(data),
    request.ip,
  ]);
}
