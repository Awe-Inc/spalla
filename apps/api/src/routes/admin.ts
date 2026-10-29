import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AppContext } from "../app.js";
import { ADMIN_ROLE, ALL_PERMISSIONS, isPermission, PERMISSIONS, TEACHER_ROLE, type Permission } from "../auth/permissions.js";
import { requirePermission, type AuthUser } from "../auth/session.js";
import { hashToken, newCode, RESET_CODE_HOURS } from "../auth/tokens.js";
import type { Queryable } from "../db/db.js";
import { readSettings, type Settings } from "../db/seed.js";
import { audit } from "../http/audit.js";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.js";
import { emailField, idParams, nameField, pagination, shortText } from "../http/schemas.js";
import { countAdmins, deleteAccount } from "./auth.js";

const INVITE_CODE_LENGTH = 10;
const RESET_CODE_LENGTH = 8;
const MAX_INVITE_DAYS = 90;

const userFilters = pagination.extend({
  q: shortText(100).optional(),
  role: shortText(40).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  teacherApplication: z.enum(["pending", "approved", "rejected"]).optional(),
});
const userPatch = z.object({ name: nameField.optional(), email: emailField.optional(), status: z.enum(["active", "suspended"]).optional() });
const rolesBody = z.object({ roles: z.array(shortText(40)).max(20) });
const permissionList = z.array(z.string().max(60)).max(ALL_PERMISSIONS.length).transform((list, issue) => {
  const unknown = list.filter((item) => !isPermission(item));
  if (unknown.length > 0) issue.addIssue({ code: "custom", message: `Permissão desconhecida: ${unknown.join(", ")}` });
  return [...new Set(list.filter(isPermission))];
});
const roleCreate = z.object({ name: nameField, description: shortText(300).default(""), permissions: permissionList });
const rolePatch = z.object({ name: nameField.optional(), description: shortText(300).optional(), permissions: permissionList.optional() });
const inviteBody = z.object({
  role: shortText(40),
  note: shortText(200).default(""),
  maxUses: z.number().int().min(1).max(500).default(1),
  days: z.number().int().min(1).max(MAX_INVITE_DAYS).default(14),
});
const auditFilters = pagination.extend({ action: shortText(60).optional(), actorId: z.uuid().optional(), targetId: shortText(60).optional() });
const settingsBody = z.object({
  signupOpen: z.boolean().optional(),
  teacherApprovalRequired: z.boolean().optional(),
  platformName: shortText(60).min(1).optional(),
  supportEmail: z.union([emailField, z.literal("")]).optional(),
});

function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.slice(0, 40) || "papel";
}

async function rolePermissions(db: Queryable, roleKeys: readonly string[]): Promise<Map<string, { id: string; permissions: Permission[] }>> {
  if (roleKeys.length === 0) return new Map();
  const rows = await db.query<{ id: string; key: string; permission: string | null }>(
    `SELECT r.id, r.key, rp.permission FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id WHERE r.key = ANY($1::text[])`,
    [roleKeys],
  );
  const roles = new Map<string, { id: string; permissions: Permission[] }>();
  for (const row of rows) {
    const entry = roles.get(row.key) ?? { id: row.id, permissions: [] };
    if (row.key === ADMIN_ROLE) entry.permissions = [...ALL_PERMISSIONS];
    else if (row.permission && isPermission(row.permission)) entry.permissions.push(row.permission);
    roles.set(row.key, entry);
  }
  return roles;
}

function assertCanGrant(me: AuthUser, permissions: readonly Permission[]): void {
  const missing = permissions.filter((permission) => !me.permissions.has(permission));
  if (missing.length > 0) throw forbidden("Você não pode dar a alguém permissões que a sua conta não tem.");
}

async function findUser(db: Queryable, id: string): Promise<{ id: string; status: string; roles: string[] }> {
  const [user] = await db.query<{ id: string; status: string; roles: string[] | null }>(
    `SELECT u.id, u.status, array_remove(array_agg(r.key), NULL) AS roles FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1 GROUP BY u.id`,
    [id],
  );
  if (!user) throw notFound("Usuário não encontrado.");
  return { id: user.id, status: user.status, roles: user.roles ?? [] };
}

async function assertNotLastAdmin(db: Queryable, user: { roles: string[]; status: string }): Promise<void> {
  if (user.roles.includes(ADMIN_ROLE) && user.status === "active" && (await countAdmins(db)) <= 1) {
    throw conflict("ultimo-admin", "Esta é a única conta de administrador ativa. Promova outra antes.");
  }
}

async function stats(db: Queryable) {
  const one = async (sql: string) => (await db.query<{ n: number }>(sql))[0]?.n ?? 0;
  const byRole = await db.query<{ key: string; name: string; users: number }>(
    "SELECT r.key, r.name, count(ur.user_id)::int AS users FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id GROUP BY r.id ORDER BY r.name",
  );
  return {
    users: await one("SELECT count(*)::int AS n FROM users"),
    suspended: await one("SELECT count(*)::int AS n FROM users WHERE status = 'suspended'"),
    pendingTeachers: await one("SELECT count(*)::int AS n FROM users WHERE teacher_application = 'pending'"),
    activeLast7Days: await one("SELECT count(*)::int AS n FROM users WHERE last_login_at > now() - interval '7 days'"),
    newLast30Days: await one("SELECT count(*)::int AS n FROM users WHERE created_at > now() - interval '30 days'"),
    classes: await one("SELECT count(*)::int AS n FROM classes WHERE archived_at IS NULL"),
    assignments: await one("SELECT count(*)::int AS n FROM assignments WHERE archived_at IS NULL"),
    materials: await one("SELECT count(*)::int AS n FROM materials"),
    practiceMinutesLast7Days: await one(
      "SELECT coalesce(round(sum(duration_seconds) / 60), 0)::int AS n FROM practice_results WHERE played_at > now() - interval '7 days'",
    ),
    byRole,
  };
}

export async function adminRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db } = ctx;
  const target = (id: string) => ({ type: "user", id });

  app.get("/admin/stats", async (request) => {
    requirePermission(request, "reports.read");
    return stats(db);
  });

  app.get("/admin/users", async (request) => {
    requirePermission(request, "users.read");
    const filters = userFilters.parse(request.query);
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: (index: number) => string, value: unknown) => {
      params.push(value);
      where.push(clause(params.length));
    };
    if (filters.q) add((i) => `(u.name ILIKE $${i} OR u.email ILIKE $${i})`, `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    if (filters.status) add((i) => `u.status = $${i}`, filters.status);
    if (filters.teacherApplication) add((i) => `u.teacher_application = $${i}`, filters.teacherApplication);
    if (filters.role) add((i) => `EXISTS (SELECT 1 FROM user_roles x JOIN roles y ON y.id = x.role_id WHERE x.user_id = u.id AND y.key = $${i})`, filters.role);
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [total] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users u ${clause}`, params);
    const rows = await db.query(
      `SELECT u.id, u.email, u.name, u.status, u.teacher_application AS "teacherApplication", u.created_at AS "createdAt",
              u.last_login_at AS "lastLoginAt",
              coalesce((SELECT array_agg(r.key ORDER BY r.key) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '{}') AS roles
       FROM users u ${clause} ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, filters.offset],
    );
    return { total: total?.n ?? 0, items: rows };
  });

  app.get("/admin/users/:id", async (request) => {
    requirePermission(request, "users.read");
    const { id } = idParams.parse(request.params);
    const [user] = await db.query(
      `SELECT id, email, name, status, teacher_application AS "teacherApplication", teacher_bio AS "teacherBio", birth_year AS "birthYear",
              guardian_name AS "guardianName", guardian_email AS "guardianEmail", guardian_consent_at AS "guardianConsentAt",
              created_at AS "createdAt", last_login_at AS "lastLoginAt"
       FROM users WHERE id = $1`,
      [id],
    );
    if (!user) throw notFound("Usuário não encontrado.");
    const { roles } = await findUser(db, id);
    const counts = await db.query<{ sessions: number; classes_taught: number; classes_joined: number; practice: number }>(
      `SELECT (SELECT count(*)::int FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()) AS sessions,
              (SELECT count(*)::int FROM classes WHERE teacher_id = $1) AS classes_taught,
              (SELECT count(*)::int FROM class_members WHERE student_id = $1) AS classes_joined,
              (SELECT count(*)::int FROM practice_results WHERE user_id = $1) AS practice`,
      [id],
    );
    const row = counts[0]!;
    return {
      ...user,
      roles,
      activeSessions: row.sessions,
      classesTaught: row.classes_taught,
      classesJoined: row.classes_joined,
      practiceResults: row.practice,
    };
  });

  app.patch("/admin/users/:id", async (request) => {
    const me = requirePermission(request, "users.manage");
    const { id } = idParams.parse(request.params);
    const body = userPatch.parse(request.body);
    const user = await findUser(db, id);
    if (body.status === "suspended") {
      if (id === me.id) throw badRequest("propria-conta", "Você não pode suspender a própria conta.");
      await assertNotLastAdmin(db, user);
      if (user.roles.includes(ADMIN_ROLE) && !me.permissions.has("roles.manage")) throw forbidden();
    }
    if (body.email) {
      const taken = await db.query("SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2", [body.email, id]);
      if (taken.length > 0) throw conflict("email-em-uso", "Já existe uma conta com esse e-mail.");
    }
    await db.query("UPDATE users SET name = coalesce($2, name), email = coalesce($3, email), status = coalesce($4, status) WHERE id = $1", [
      id,
      body.name ?? null,
      body.email ?? null,
      body.status ?? null,
    ]);
    if (body.status === "suspended") await db.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [id]);
    await audit(db, request, body.status ? `usuario.${body.status === "active" ? "reativado" : "suspenso"}` : "usuario.editado", target(id), body);
    return { ok: true };
  });

  app.put("/admin/users/:id/roles", async (request) => {
    const me = requirePermission(request, "users.manage");
    const { id } = idParams.parse(request.params);
    const body = rolesBody.parse(request.body);
    const user = await findUser(db, id);
    const wanted = [...new Set(body.roles)];
    const roles = await rolePermissions(db, [...new Set([...wanted, ...user.roles])]);
    const unknown = wanted.filter((key) => !roles.has(key));
    if (unknown.length > 0) throw badRequest("papel-desconhecido", `Papel desconhecido: ${unknown.join(", ")}`);
    const added = wanted.filter((key) => !user.roles.includes(key));
    const removed = user.roles.filter((key) => !wanted.includes(key));
    assertCanGrant(me, [...added, ...removed].flatMap((key) => roles.get(key)?.permissions ?? []));
    if (removed.includes(ADMIN_ROLE)) await assertNotLastAdmin(db, user);
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM user_roles WHERE user_id = $1", [id]);
      for (const key of wanted) await tx.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [id, roles.get(key)!.id]);
      if (added.includes(TEACHER_ROLE)) await tx.query("UPDATE users SET teacher_application = 'approved' WHERE id = $1", [id]);
    });
    await audit(db, request, "usuario.papeis", target(id), { added, removed });
    return { roles: wanted.sort() };
  });

  app.post("/admin/users/:id/revoke-sessions", async (request) => {
    requirePermission(request, "users.manage");
    const { id } = idParams.parse(request.params);
    await findUser(db, id);
    const rows = await db.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id", [id]);
    await audit(db, request, "usuario.sessoes-encerradas", target(id), { count: rows.length });
    return { revoked: rows.length };
  });

  app.post("/admin/users/:id/reset-code", async (request) => {
    const me = requirePermission(request, "users.manage");
    const { id } = idParams.parse(request.params);
    const user = await findUser(db, id);
    if (user.roles.includes(ADMIN_ROLE) && id !== me.id && !me.permissions.has("roles.manage")) throw forbidden();
    const code = newCode(RESET_CODE_LENGTH);
    await db.query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [id]);
    await db.query(
      `INSERT INTO password_resets (user_id, code_hash, created_by, expires_at) VALUES ($1, $2, $3, now() + interval '${RESET_CODE_HOURS} hours')`,
      [id, hashToken(code), me.id],
    );
    await audit(db, request, "usuario.codigo-redefinicao", target(id));
    return { code, expiresInHours: RESET_CODE_HOURS };
  });

  app.delete("/admin/users/:id", async (request, reply) => {
    const me = requirePermission(request, "users.manage");
    const { id } = idParams.parse(request.params);
    if (id === me.id) throw badRequest("propria-conta", "Para apagar a própria conta, use a tela da conta.");
    const user = await findUser(db, id);
    await assertNotLastAdmin(db, user);
    const roles = await rolePermissions(db, user.roles);
    assertCanGrant(me, [...roles.values()].flatMap((role) => role.permissions));
    await deleteAccount(ctx, id);
    await audit(db, request, "usuario.apagado", target(id));
    return reply.code(204).send();
  });

  app.get("/admin/teacher-applications", async (request) => {
    requirePermission(request, "teachers.approve");
    return db.query(
      `SELECT id, name, email, teacher_bio AS "teacherBio", created_at AS "createdAt" FROM users
       WHERE teacher_application = 'pending' ORDER BY created_at`,
    );
  });

  const decide = (decision: "approved" | "rejected") => async (request: FastifyRequest) => {
    requirePermission(request, "teachers.approve");
    const { id } = idParams.parse(request.params);
    await findUser(db, id);
    await db.transaction(async (tx) => {
      await tx.query("UPDATE users SET teacher_application = $2 WHERE id = $1", [id, decision]);
      const [role] = await tx.query<{ id: string }>("SELECT id FROM roles WHERE key = $1", [TEACHER_ROLE]);
      if (decision === "approved") await tx.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, role!.id]);
      else await tx.query("DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2", [id, role!.id]);
    });
    await audit(db, request, decision === "approved" ? "professor.aprovado" : "professor.recusado", target(id));
    return { teacherApplication: decision };
  };
  app.post("/admin/teachers/:id/approve", decide("approved"));
  app.post("/admin/teachers/:id/reject", decide("rejected"));

  app.get("/admin/permissions", async (request) => {
    requirePermission(request, "users.read", "roles.manage");
    return Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label }));
  });

  app.get("/admin/roles", async (request) => {
    requirePermission(request, "users.read", "roles.manage", "invites.manage");
    const roles = await db.query<{ id: string; key: string; name: string; description: string; built_in: boolean; users: number; permissions: string[] | null }>(
      `SELECT r.id, r.key, r.name, r.description, r.built_in,
              (SELECT count(*)::int FROM user_roles ur WHERE ur.role_id = r.id) AS users,
              (SELECT array_agg(rp.permission ORDER BY rp.permission) FROM role_permissions rp WHERE rp.role_id = r.id) AS permissions
       FROM roles r ORDER BY r.built_in DESC, r.name`,
    );
    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      builtIn: role.built_in,
      users: role.users,
      permissions: role.key === ADMIN_ROLE ? ALL_PERMISSIONS : (role.permissions ?? []),
    }));
  });

  app.post("/admin/roles", async (request, reply) => {
    const me = requirePermission(request, "roles.manage");
    const body = roleCreate.parse(request.body);
    assertCanGrant(me, body.permissions);
    const key = slugify(body.name);
    const taken = await db.query("SELECT 1 FROM roles WHERE key = $1", [key]);
    if (taken.length > 0) throw conflict("papel-existe", "Já existe um papel com esse nome.");
    const id = await db.transaction(async (tx) => {
      const [role] = await tx.query<{ id: string }>("INSERT INTO roles (key, name, description) VALUES ($1, $2, $3) RETURNING id", [
        key,
        body.name,
        body.description,
      ]);
      for (const permission of body.permissions) await tx.query("INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2)", [role!.id, permission]);
      return role!.id;
    });
    await audit(db, request, "papel.criado", { type: "role", id }, { key, permissions: body.permissions });
    return reply.code(201).send({ id, key });
  });

  app.patch("/admin/roles/:id", async (request) => {
    const me = requirePermission(request, "roles.manage");
    const { id } = idParams.parse(request.params);
    const body = rolePatch.parse(request.body);
    const [role] = await db.query<{ key: string }>("SELECT key FROM roles WHERE id = $1", [id]);
    if (!role) throw notFound("Papel não encontrado.");
    if (role.key === ADMIN_ROLE && body.permissions) throw badRequest("papel-admin", "As permissões do administrador não mudam: ele tem todas.");
    if (body.permissions) {
      const current = (await rolePermissions(db, [role.key])).get(role.key)?.permissions ?? [];
      const changed = [...body.permissions.filter((p) => !current.includes(p)), ...current.filter((p) => !body.permissions!.includes(p))];
      assertCanGrant(me, changed);
    }
    await db.transaction(async (tx) => {
      await tx.query("UPDATE roles SET name = coalesce($2, name), description = coalesce($3, description) WHERE id = $1", [
        id,
        body.name ?? null,
        body.description ?? null,
      ]);
      if (body.permissions) {
        await tx.query("DELETE FROM role_permissions WHERE role_id = $1", [id]);
        for (const permission of body.permissions) await tx.query("INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2)", [id, permission]);
      }
    });
    await audit(db, request, "papel.editado", { type: "role", id }, body);
    return { ok: true };
  });

  app.delete("/admin/roles/:id", async (request, reply) => {
    requirePermission(request, "roles.manage");
    const { id } = idParams.parse(request.params);
    const [role] = await db.query<{ key: string; built_in: boolean }>("SELECT key, built_in FROM roles WHERE id = $1", [id]);
    if (!role) throw notFound("Papel não encontrado.");
    if (role.built_in) throw badRequest("papel-do-sistema", "Papéis do sistema não podem ser apagados.");
    await db.query("DELETE FROM roles WHERE id = $1", [id]);
    await audit(db, request, "papel.apagado", { type: "role", id }, { key: role.key });
    return reply.code(204).send();
  });

  app.get("/admin/invites", async (request) => {
    requirePermission(request, "invites.manage");
    return db.query(
      `SELECT i.id, i.code, r.key AS role, r.name AS "roleName", i.note, i.max_uses AS "maxUses", i.uses, i.created_at AS "createdAt",
              i.expires_at AS "expiresAt", i.revoked_at AS "revokedAt", u.name AS "createdBy"
       FROM invites i JOIN roles r ON r.id = i.role_id LEFT JOIN users u ON u.id = i.created_by
       ORDER BY i.created_at DESC LIMIT 200`,
    );
  });

  app.post("/admin/invites", async (request, reply) => {
    const me = requirePermission(request, "invites.manage");
    const body = inviteBody.parse(request.body);
    const role = (await rolePermissions(db, [body.role])).get(body.role);
    if (!role) throw badRequest("papel-desconhecido", "Papel desconhecido.");
    assertCanGrant(me, role.permissions);
    const code = newCode(INVITE_CODE_LENGTH);
    const [invite] = await db.query<{ id: string; expires_at: Date }>(
      `INSERT INTO invites (code, role_id, note, max_uses, created_by, expires_at) VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6))
       RETURNING id, expires_at`,
      [code, role.id, body.note, body.maxUses, me.id, body.days],
    );
    await audit(db, request, "convite.criado", { type: "invite", id: invite!.id }, { role: body.role, maxUses: body.maxUses });
    return reply.code(201).send({ id: invite!.id, code, expiresAt: invite!.expires_at });
  });

  app.delete("/admin/invites/:id", async (request, reply) => {
    requirePermission(request, "invites.manage");
    const { id } = idParams.parse(request.params);
    const rows = await db.query("UPDATE invites SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id", [id]);
    if (rows.length === 0) throw notFound("Convite não encontrado.");
    await audit(db, request, "convite.revogado", { type: "invite", id });
    return reply.code(204).send();
  });

  app.get("/admin/audit", async (request) => {
    requirePermission(request, "audit.read");
    const filters = auditFilters.parse(request.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (filters.action) {
      params.push(`${filters.action}%`);
      where.push(`a.action LIKE $${params.length}`);
    }
    if (filters.actorId) {
      params.push(filters.actorId);
      where.push(`a.actor_id = $${params.length}`);
    }
    if (filters.targetId) {
      params.push(filters.targetId);
      where.push(`a.target_id = $${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [total] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_log a ${clause}`, params);
    const items = await db.query(
      `SELECT a.id::text AS id, a.action, a.target_type AS "targetType", a.target_id AS "targetId", a.data, a.ip, a.at,
              a.actor_id AS "actorId", u.name AS "actorName", u.email AS "actorEmail"
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ${clause}
       ORDER BY a.at DESC, a.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, filters.offset],
    );
    return { total: total?.n ?? 0, items };
  });

  app.get("/admin/settings", async (request) => {
    requirePermission(request, "settings.manage", "reports.read");
    return readSettings(db);
  });

  app.put("/admin/settings", async (request) => {
    requirePermission(request, "settings.manage");
    const body = settingsBody.parse(request.body) as Partial<Settings>;
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      await db.query("INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [
        key,
        JSON.stringify(value),
      ]);
    }
    await audit(db, request, "configuracoes.alteradas", null, body);
    return readSettings(db);
  });
}
