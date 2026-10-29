import type { FastifyRequest } from "fastify";

import type { Queryable } from "../db/db.js";
import { forbidden, unauthorized } from "../http/errors.js";
import { ADMIN_ROLE, ALL_PERMISSIONS, isPermission, type Permission } from "./permissions.js";
import { hashToken, newSessionToken, SESSION_DAYS } from "./tokens.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  sessionId: string;
  roles: string[];
  permissions: Set<Permission>;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthUser | null;
  }
}

const SEEN_THROTTLE = "5 minutes";
const USER_AGENT_LENGTH = 200;

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length >= 20 && token.length <= 100 ? token : null;
}

export async function userAccess(db: Queryable, userId: string): Promise<{ roles: string[]; permissions: Set<Permission> }> {
  const rows = await db.query<{ key: string; permission: string | null }>(
    `SELECT r.key, rp.permission FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE ur.user_id = $1`,
    [userId],
  );
  const roles = [...new Set(rows.map((row) => row.key))].sort();
  if (roles.includes(ADMIN_ROLE)) return { roles, permissions: new Set(ALL_PERMISSIONS) };
  const permissions = new Set(rows.flatMap((row) => (row.permission && isPermission(row.permission) ? [row.permission] : [])));
  return { roles, permissions };
}

export async function loadAuth(db: Queryable, token: string | null): Promise<AuthUser | null> {
  if (!token) return null;
  const [row] = await db.query<{ session_id: string; id: string; email: string; name: string }>(
    `SELECT s.id AS session_id, u.id, u.email, u.name FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`,
    [hashToken(token)],
  );
  if (!row) return null;
  await db.query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '${SEEN_THROTTLE}'`, [row.session_id]);
  const access = await userAccess(db, row.id);
  return { id: row.id, email: row.email, name: row.name, sessionId: row.session_id, ...access };
}

export async function createSession(db: Queryable, userId: string, userAgent: string | undefined): Promise<string> {
  const token = newSessionToken();
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, expires_at) VALUES ($1, $2, $3, now() + interval '${SESSION_DAYS} days')`,
    [userId, hashToken(token), userAgent?.slice(0, USER_AGENT_LENGTH) ?? null],
  );
  await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
  return token;
}

export function requireAuth(request: FastifyRequest): AuthUser {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

export function requirePermission(request: FastifyRequest, ...anyOf: Permission[]): AuthUser {
  const user = requireAuth(request);
  if (!anyOf.some((permission) => user.permissions.has(permission))) throw forbidden();
  return user;
}
