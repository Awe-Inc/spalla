import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AppContext } from "../app.js";
import { dummyPasswordHash, hashPassword, verifyPassword } from "../auth/password.js";
import { ADMIN_ROLE, STUDENT_ROLE, TEACHER_ROLE } from "../auth/permissions.js";
import { createSession, requireAuth, userAccess } from "../auth/session.js";
import { hashToken, normalizeCode } from "../auth/tokens.js";
import type { Queryable } from "../db/db.js";
import { readSettings } from "../db/seed.js";
import { audit } from "../http/audit.js";
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from "../http/errors.js";
import { emailField, idParams, nameField, passwordField, shortText } from "../http/schemas.js";

export const GUARDIAN_AGE = 12;
export const ADULT_AGE = 18;

const currentYear = () => new Date().getUTCFullYear();

const signupBody = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  accountType: z.enum(["aluno", "professor"]),
  classCode: shortText(20).optional(),
  inviteCode: shortText(40).optional(),
  teacherBio: shortText(1000).optional(),
  birthYear: z.number().int().min(1900).max(2100).optional(),
  guardianName: nameField.optional(),
  guardianEmail: emailField.optional(),
  guardianConsent: z.boolean().optional(),
  acceptTerms: z.literal(true, "Aceite os termos de uso e a política de privacidade para criar a conta."),
});

type SignupBody = z.infer<typeof signupBody>;

const loginBody = z.object({ email: emailField, password: z.string().min(1).max(200) });
const profileBody = z.object({ name: nameField.optional(), teacherBio: shortText(1000).optional() });
const passwordBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordField });
const resetBody = z.object({ email: emailField, code: shortText(40), newPassword: passwordField });
const deleteBody = z.object({ password: z.string().min(1).max(200) });

export interface MePayload {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  teacherApplication: string | null;
  teacherBio: string | null;
  createdAt: string;
}

export async function mePayload(db: Queryable, userId: string): Promise<MePayload> {
  const [user] = await db.query<{ id: string; email: string; name: string; teacher_application: string | null; teacher_bio: string | null; created_at: Date }>(
    "SELECT id, email, name, teacher_application, teacher_bio, created_at FROM users WHERE id = $1",
    [userId],
  );
  if (!user) throw notFound("Conta não encontrada.");
  const access = await userAccess(db, userId);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: access.roles,
    permissions: [...access.permissions].sort(),
    teacherApplication: user.teacher_application,
    teacherBio: user.teacher_bio,
    createdAt: new Date(user.created_at).toISOString(),
  };
}

function checkAge(body: SignupBody): void {
  if (body.birthYear === undefined) return;
  const age = currentYear() - body.birthYear;
  if (age < 3) throw badRequest("ano-invalido", "Confira o ano de nascimento.");
  if (body.accountType === "professor" && age < ADULT_AGE) throw badRequest("idade-professor", "Conta de professor é só para maiores de 18 anos.");
  if (age <= GUARDIAN_AGE && !(body.guardianName && body.guardianEmail && body.guardianConsent)) {
    throw badRequest("responsavel-obrigatorio", "Para quem tem até 12 anos, o responsável precisa informar nome, e-mail e dar o consentimento.");
  }
}

async function roleId(db: Queryable, key: string): Promise<string> {
  const [row] = await db.query<{ id: string }>("SELECT id FROM roles WHERE key = $1", [key]);
  if (!row) throw new Error(`papel ${key} ausente; rode o seed`);
  return row.id;
}

async function takeInvite(db: Queryable, code: string): Promise<{ id: string; roleId: string; roleKey: string }> {
  const [invite] = await db.query<{ id: string; role_id: string; key: string }>(
    `UPDATE invites i SET uses = uses + 1 FROM roles r
     WHERE r.id = i.role_id AND i.code = $1 AND i.revoked_at IS NULL AND i.expires_at > now() AND i.uses < i.max_uses
     RETURNING i.id, i.role_id, r.key`,
    [normalizeCode(code)],
  );
  if (!invite) throw badRequest("convite-invalido", "Esse convite não vale mais. Peça um novo a quem convidou.");
  return { id: invite.id, roleId: invite.role_id, roleKey: invite.key };
}

export async function joinClassByCode(db: Queryable, studentId: string, code: string): Promise<{ id: string; name: string }> {
  const [klass] = await db.query<{ id: string; name: string; teacher_id: string }>(
    "SELECT id, name, teacher_id FROM classes WHERE join_code = $1 AND archived_at IS NULL",
    [normalizeCode(code)],
  );
  if (!klass) throw badRequest("codigo-turma-invalido", "Não achamos turma com esse código. Confira com o professor.");
  if (klass.teacher_id === studentId) throw badRequest("propria-turma", "Você é o professor dessa turma.");
  await db.query("INSERT INTO class_members (class_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [klass.id, studentId]);
  await db.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [studentId, await roleId(db, STUDENT_ROLE)]);
  return { id: klass.id, name: klass.name };
}

export async function countAdmins(db: Queryable): Promise<number> {
  const [row] = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id
     WHERE r.key = $1 AND u.status = 'active'`,
    [ADMIN_ROLE],
  );
  return row?.count ?? 0;
}

async function createAccount(ctx: AppContext, body: SignupBody): Promise<{ userId: string; joinedClass: string | null }> {
  return ctx.db.transaction(async (tx) => {
    const settings = await readSettings(tx);
    const invite = body.inviteCode ? await takeInvite(tx, body.inviteCode) : null;
    if (!settings.signupOpen && !invite) throw forbidden("O cadastro está fechado no momento. Peça um convite.");
    const taken = await tx.query("SELECT 1 FROM users WHERE lower(email) = $1", [body.email]);
    if (taken.length > 0) throw conflict("email-em-uso", "Já existe uma conta com esse e-mail.");
    const invitedAsTeacher = invite?.roleKey === TEACHER_ROLE;
    const wantsTeacher = body.accountType === "professor" && !invitedAsTeacher;
    const application = wantsTeacher ? (settings.teacherApprovalRequired ? "pending" : "approved") : invitedAsTeacher ? "approved" : null;
    const minor = body.birthYear !== undefined && currentYear() - body.birthYear <= GUARDIAN_AGE;
    const [user] = await tx.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash, teacher_application, teacher_bio, birth_year, guardian_name, guardian_email, guardian_consent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        body.email,
        body.name,
        await hashPassword(body.password),
        application,
        body.teacherBio ?? null,
        body.birthYear ?? null,
        minor ? body.guardianName : null,
        minor ? body.guardianEmail : null,
        minor ? new Date() : null,
      ],
    );
    const userId = user!.id;
    const roles = new Set<string>();
    if (invite) roles.add(invite.roleId);
    if (body.accountType === "aluno") roles.add(await roleId(tx, STUDENT_ROLE));
    if (application === "approved") roles.add(await roleId(tx, TEACHER_ROLE));
    for (const id of roles) await tx.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [userId, id]);
    const joined = body.classCode && body.accountType === "aluno" ? await joinClassByCode(tx, userId, body.classCode) : null;
    return { userId, joinedClass: joined?.name ?? null };
  });
}

export async function authRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db } = ctx;
  const strict = { config: { rateLimit: { max: ctx.config.rateLimitAuthMax, timeWindow: "1 minute" } } };

  app.post("/auth/signup", strict, async (request, reply) => {
    const body = signupBody.parse(request.body);
    checkAge(body);
    const { userId, joinedClass } = await createAccount(ctx, body);
    await audit(db, request, "conta.criada", { type: "user", id: userId }, { accountType: body.accountType, invite: Boolean(body.inviteCode) }, userId);
    const token = await createSession(db, userId, request.headers["user-agent"]);
    return reply.code(201).send({ token, user: await mePayload(db, userId), joinedClass });
  });

  app.post("/auth/login", strict, async (request) => {
    const body = loginBody.parse(request.body);
    const [user] = await db.query<{ id: string; password_hash: string; status: string }>(
      "SELECT id, password_hash, status FROM users WHERE lower(email) = $1",
      [body.email],
    );
    const valid = await verifyPassword(body.password, user?.password_hash ?? (await dummyPasswordHash()));
    if (!user || !valid) {
      if (user) await audit(db, request, "login.falhou", { type: "user", id: user.id }, {}, null);
      throw unauthorized("E-mail ou senha incorretos.");
    }
    if (user.status !== "active") throw new AppError(403, "conta-suspensa", "Esta conta está suspensa. Fale com o suporte.");
    const token = await createSession(db, user.id, request.headers["user-agent"]);
    return { token, user: await mePayload(db, user.id) };
  });

  app.post("/auth/logout", async (request, reply) => {
    const me = requireAuth(request);
    await db.query("UPDATE sessions SET revoked_at = now() WHERE id = $1", [me.sessionId]);
    return reply.code(204).send();
  });

  app.get("/auth/me", async (request) => mePayload(db, requireAuth(request).id));

  app.patch("/auth/me", async (request) => {
    const me = requireAuth(request);
    const body = profileBody.parse(request.body);
    await db.query("UPDATE users SET name = coalesce($2, name), teacher_bio = coalesce($3, teacher_bio) WHERE id = $1", [
      me.id,
      body.name ?? null,
      body.teacherBio ?? null,
    ]);
    return mePayload(db, me.id);
  });

  app.post("/auth/password", strict, async (request, reply) => {
    const me = requireAuth(request);
    const body = passwordBody.parse(request.body);
    const [user] = await db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [me.id]);
    if (!user || !(await verifyPassword(body.currentPassword, user.password_hash))) throw badRequest("senha-atual", "A senha atual não confere.");
    await db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [me.id, await hashPassword(body.newPassword)]);
    await db.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL", [me.id, me.sessionId]);
    await audit(db, request, "senha.trocada", { type: "user", id: me.id });
    return reply.code(204).send();
  });

  app.post("/auth/reset", strict, async (request, reply) => {
    const body = resetBody.parse(request.body);
    const userId = await db.transaction(async (tx) => {
      const [reset] = await tx.query<{ id: string; user_id: string }>(
        `UPDATE password_resets pr SET used_at = now() FROM users u
         WHERE u.id = pr.user_id AND lower(u.email) = $1 AND pr.code_hash = $2 AND pr.used_at IS NULL AND pr.expires_at > now()
         RETURNING pr.id, pr.user_id`,
        [body.email, hashToken(normalizeCode(body.code))],
      );
      if (!reset) throw badRequest("codigo-invalido", "Código inválido ou vencido. Peça um novo ao suporte.");
      await tx.query("UPDATE users SET password_hash = $2 WHERE id = $1", [reset.user_id, await hashPassword(body.newPassword)]);
      await tx.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [reset.user_id]);
      return reset.user_id;
    });
    await audit(db, request, "senha.redefinida", { type: "user", id: userId }, {}, userId);
    return reply.code(204).send();
  });

  app.get("/auth/sessions", async (request) => {
    const me = requireAuth(request);
    const rows = await db.query<{ id: string; user_agent: string | null; created_at: Date; last_seen_at: Date }>(
      "SELECT id, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_seen_at DESC",
      [me.id],
    );
    return rows.map((row) => ({ id: row.id, userAgent: row.user_agent, createdAt: row.created_at, lastSeenAt: row.last_seen_at, current: row.id === me.sessionId }));
  });

  app.delete("/auth/sessions/:id", async (request, reply) => {
    const me = requireAuth(request);
    const { id } = idParams.parse(request.params);
    const rows = await db.query("UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id", [id, me.id]);
    if (rows.length === 0) throw notFound("Sessão não encontrada.");
    return reply.code(204).send();
  });

  app.get("/auth/export", async (request, reply) => {
    const me = requireAuth(request);
    const data = await exportAccount(db, me.id);
    return reply.header("Content-Disposition", 'attachment; filename="spalla-meus-dados.json"').send(data);
  });

  app.delete("/auth/account", strict, async (request, reply) => {
    const me = requireAuth(request);
    const body = deleteBody.parse(request.body);
    const [user] = await db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [me.id]);
    if (!user || !(await verifyPassword(body.password, user.password_hash))) throw badRequest("senha-atual", "A senha não confere.");
    if (me.roles.includes(ADMIN_ROLE) && (await countAdmins(db)) <= 1) {
      throw conflict("ultimo-admin", "Você é o único administrador. Promova outra pessoa antes de apagar a conta.");
    }
    await deleteAccount(ctx, me.id);
    await audit(db, request, "conta.apagada", { type: "user", id: me.id }, {}, null);
    return reply.code(204).send();
  });
}

export async function deleteAccount(ctx: AppContext, userId: string): Promise<void> {
  const files = await ctx.db.query<{ storage_key: string }>("SELECT storage_key FROM files WHERE owner_id = $1", [userId]);
  await ctx.db.query("DELETE FROM users WHERE id = $1", [userId]);
  for (const file of files) await ctx.files.remove(file.storage_key);
}

async function exportAccount(db: Queryable, userId: string): Promise<Record<string, unknown>> {
  const [profile] = await db.query(
    "SELECT id, email, name, status, teacher_application, teacher_bio, birth_year, guardian_name, guardian_email, guardian_consent_at, created_at, last_login_at FROM users WHERE id = $1",
    [userId],
  );
  const pick = (sql: string) => db.query(sql, [userId]);
  return {
    exportedAt: new Date().toISOString(),
    profile,
    roles: (await userAccess(db, userId)).roles,
    sessions: await pick("SELECT created_at, last_seen_at, user_agent, revoked_at FROM sessions WHERE user_id = $1"),
    classesTaught: await pick("SELECT id, name, description, created_at FROM classes WHERE teacher_id = $1"),
    classesJoined: await pick("SELECT c.id, c.name, m.joined_at FROM class_members m JOIN classes c ON c.id = m.class_id WHERE m.student_id = $1"),
    assignmentStatus: await pick("SELECT assignment_id, done_at, student_note, feedback, feedback_at FROM assignment_status WHERE student_id = $1"),
    materials: await pick("SELECT id, title, kind, url, body, created_at FROM materials WHERE teacher_id = $1"),
    practice: await pick(
      "SELECT exercise_id, played_at, accuracy_pct, mean_signed_cents, bpm, stars, duration_seconds FROM practice_results WHERE user_id = $1 ORDER BY played_at",
    ),
  };
}
