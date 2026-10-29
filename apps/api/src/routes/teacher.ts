import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AppContext } from "../app.js";
import { requirePermission } from "../auth/session.js";
import { newCode } from "../auth/tokens.js";
import type { Queryable } from "../db/db.js";
import { isPdf, newStorageKey } from "../files/store.js";
import { audit } from "../http/audit.js";
import { badRequest, notFound } from "../http/errors.js";
import { httpUrl, idParams, nameField, shortText, title } from "../http/schemas.js";
import {
  assertMyStudent,
  assertOwnClasses,
  assertOwnMaterials,
  ownClass,
  practiceSummary,
} from "./access.js";
import { assignmentCreate, assignmentPatch, planCreate, planPatch } from "./lessonSchemas.js";

const CLASS_CODE_LENGTH = 6;
const MAX_FILE_NAME = 120;

const classBody = z.object({ name: nameField, description: shortText(1000).default("") });
const classPatch = z.object({ name: nameField.optional(), description: shortText(1000).optional(), archived: z.boolean().optional() });
const memberParams = z.object({ id: z.uuid(), studentId: z.uuid() });
const announcementBody = z.object({ body: z.string().trim().min(1, "Escreva o aviso.").max(4000) });
const classIdsField = z.array(z.uuid()).max(50).default([]);
const materialCreate = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link"), title, url: httpUrl, body: shortText(4000).default(""), classIds: classIdsField }),
  z.object({ kind: z.literal("text"), title, body: z.string().trim().min(1, "Escreva o texto.").max(20000), classIds: classIdsField }),
]);
const materialPatch = z.object({
  title: title.optional(),
  url: httpUrl.optional(),
  body: z.string().trim().max(20000).optional(),
  classIds: z.array(z.uuid()).max(50).optional(),
});
const feedbackBody = z.object({ feedback: z.string().trim().max(4000) });
const assignmentFilters = z.object({ classId: z.uuid().optional(), studentId: z.uuid().optional() });
const progressQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
const pdfFields = z.object({ title, classIds: z.string().max(2000).default("") });

async function uniqueClassCode(db: Queryable): Promise<string> {
  for (;;) {
    const code = newCode(CLASS_CODE_LENGTH);
    const taken = await db.query("SELECT 1 FROM classes WHERE join_code = $1", [code]);
    if (taken.length === 0) return code;
  }
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N} ._-]/gu, "_").trim().slice(0, MAX_FILE_NAME);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "material"}.pdf`;
}

function multipartField(file: MultipartFile, name: string): string | undefined {
  const field = file.fields[name];
  if (!field || Array.isArray(field) || field.type !== "field") return undefined;
  return typeof field.value === "string" ? field.value : undefined;
}

async function shareMaterial(db: Queryable, materialId: string, classIds: readonly string[]): Promise<void> {
  await db.query("DELETE FROM material_shares WHERE material_id = $1", [materialId]);
  for (const classId of new Set(classIds)) await db.query("INSERT INTO material_shares (material_id, class_id) VALUES ($1, $2)", [materialId, classId]);
}

async function ownAssignment(db: Queryable, teacherId: string, id: string) {
  const [row] = await db.query<{ id: string; class_id: string | null; student_id: string | null }>(
    "SELECT id, class_id, student_id FROM assignments WHERE id = $1 AND teacher_id = $2",
    [id, teacherId],
  );
  if (!row) throw notFound("Tarefa não encontrada.");
  return row;
}

async function assertAudience(db: Queryable, teacherId: string, body: { classId?: string | undefined; studentId?: string | undefined }) {
  if (body.classId) await ownClass(db, teacherId, body.classId);
  if (body.studentId) await assertMyStudent(db, teacherId, body.studentId);
}

const MATERIAL_COLUMNS = `m.id, m.title, m.kind, m.url, m.body, m.created_at AS "createdAt", m.file_id AS "fileId",
  f.name AS "fileName", f.size_bytes AS "fileSize"`;

export async function teacherRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db } = ctx;

  app.get("/teacher/classes", async (request) => {
    const me = requirePermission(request, "classes.manage");
    return db.query(
      `SELECT c.id, c.name, c.description, c.join_code AS "joinCode", c.created_at AS "createdAt", c.archived_at AS "archivedAt",
              (SELECT count(*)::int FROM class_members m WHERE m.class_id = c.id) AS students
       FROM classes c WHERE c.teacher_id = $1 ORDER BY c.archived_at NULLS FIRST, c.created_at DESC`,
      [me.id],
    );
  });

  app.post("/teacher/classes", async (request, reply) => {
    const me = requirePermission(request, "classes.manage");
    const body = classBody.parse(request.body);
    const [klass] = await db.query<{ id: string; join_code: string }>(
      "INSERT INTO classes (teacher_id, name, description, join_code) VALUES ($1, $2, $3, $4) RETURNING id, join_code",
      [me.id, body.name, body.description, await uniqueClassCode(db)],
    );
    await audit(db, request, "turma.criada", { type: "class", id: klass!.id });
    return reply.code(201).send({ id: klass!.id, joinCode: klass!.join_code });
  });

  app.get("/teacher/classes/:id", async (request) => {
    const me = requirePermission(request, "classes.manage");
    const { id } = idParams.parse(request.params);
    await ownClass(db, me.id, id);
    const [klass] = await db.query(
      `SELECT id, name, description, join_code AS "joinCode", created_at AS "createdAt", archived_at AS "archivedAt" FROM classes WHERE id = $1`,
      [id],
    );
    const students = await db.query(
      `SELECT u.id, u.name, u.email, m.joined_at AS "joinedAt",
              (SELECT max(played_at) FROM practice_results p WHERE p.user_id = u.id) AS "lastPracticeAt",
              (SELECT coalesce(round(sum(duration_seconds) / 60), 0)::int FROM practice_results p
                WHERE p.user_id = u.id AND p.played_at > now() - interval '7 days') AS "minutesLast7Days",
              (SELECT count(*)::int FROM assignment_status s JOIN assignments a ON a.id = s.assignment_id
                WHERE s.student_id = u.id AND a.teacher_id = $2 AND s.done_at IS NOT NULL) AS "assignmentsDone"
       FROM class_members m JOIN users u ON u.id = m.student_id WHERE m.class_id = $1 ORDER BY u.name`,
      [id, me.id],
    );
    const announcements = await db.query(
      `SELECT id, body, created_at AS "createdAt" FROM announcements WHERE class_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [id],
    );
    return { ...klass, students, announcements };
  });

  app.patch("/teacher/classes/:id", async (request) => {
    const me = requirePermission(request, "classes.manage");
    const { id } = idParams.parse(request.params);
    const body = classPatch.parse(request.body);
    await ownClass(db, me.id, id);
    await db.query(
      `UPDATE classes SET name = coalesce($2, name), description = coalesce($3, description),
         archived_at = CASE WHEN $4::boolean IS NULL THEN archived_at WHEN $4 THEN coalesce(archived_at, now()) ELSE NULL END
       WHERE id = $1`,
      [id, body.name ?? null, body.description ?? null, body.archived ?? null],
    );
    return { ok: true };
  });

  app.post("/teacher/classes/:id/code", async (request) => {
    const me = requirePermission(request, "classes.manage");
    const { id } = idParams.parse(request.params);
    await ownClass(db, me.id, id);
    const joinCode = await uniqueClassCode(db);
    await db.query("UPDATE classes SET join_code = $2 WHERE id = $1", [id, joinCode]);
    return { joinCode };
  });

  app.delete("/teacher/classes/:id/students/:studentId", async (request, reply) => {
    const me = requirePermission(request, "classes.manage");
    const { id, studentId } = memberParams.parse(request.params);
    await ownClass(db, me.id, id);
    const rows = await db.query("DELETE FROM class_members WHERE class_id = $1 AND student_id = $2 RETURNING student_id", [id, studentId]);
    if (rows.length === 0) throw notFound("Aluno não está nessa turma.");
    await audit(db, request, "turma.aluno-removido", { type: "class", id }, { studentId });
    return reply.code(204).send();
  });

  app.post("/teacher/classes/:id/announcements", async (request, reply) => {
    const me = requirePermission(request, "classes.manage");
    const { id } = idParams.parse(request.params);
    const body = announcementBody.parse(request.body);
    await ownClass(db, me.id, id);
    const [row] = await db.query<{ id: string }>("INSERT INTO announcements (class_id, author_id, body) VALUES ($1, $2, $3) RETURNING id", [
      id,
      me.id,
      body.body,
    ]);
    return reply.code(201).send({ id: row!.id });
  });

  app.delete("/teacher/announcements/:id", async (request, reply) => {
    const me = requirePermission(request, "classes.manage");
    const { id } = idParams.parse(request.params);
    const rows = await db.query(
      "DELETE FROM announcements a USING classes c WHERE a.id = $1 AND c.id = a.class_id AND c.teacher_id = $2 RETURNING a.id",
      [id, me.id],
    );
    if (rows.length === 0) throw notFound("Aviso não encontrado.");
    return reply.code(204).send();
  });

  app.get("/teacher/students", async (request) => {
    const me = requirePermission(request, "students.progress.read");
    return db.query(
      `SELECT u.id, u.name, u.email, array_agg(c.name ORDER BY c.name) AS classes,
              (SELECT max(played_at) FROM practice_results p WHERE p.user_id = u.id) AS "lastPracticeAt",
              (SELECT coalesce(round(sum(duration_seconds) / 60), 0)::int FROM practice_results p
                WHERE p.user_id = u.id AND p.played_at > now() - interval '7 days') AS "minutesLast7Days"
       FROM class_members m JOIN classes c ON c.id = m.class_id JOIN users u ON u.id = m.student_id
       WHERE c.teacher_id = $1 GROUP BY u.id ORDER BY u.name`,
      [me.id],
    );
  });

  app.get("/teacher/students/:id/progress", async (request) => {
    const me = requirePermission(request, "students.progress.read");
    const { id } = idParams.parse(request.params);
    const { days } = progressQuery.parse(request.query);
    await assertMyStudent(db, me.id, id);
    const [student] = await db.query(`SELECT id, name, email FROM users WHERE id = $1`, [id]);
    const assignments = await db.query(
      `SELECT a.id, a.title, to_char(a.due_on, 'YYYY-MM-DD') AS "dueOn", s.done_at AS "doneAt", s.student_note AS "studentNote", s.feedback
       FROM assignments a
       LEFT JOIN assignment_status s ON s.assignment_id = a.id AND s.student_id = $2
       WHERE a.teacher_id = $1 AND a.archived_at IS NULL
         AND (a.student_id = $2 OR a.class_id IN (SELECT class_id FROM class_members WHERE student_id = $2))
       ORDER BY a.created_at DESC LIMIT 100`,
      [me.id, id],
    );
    return { student, practice: await practiceSummary(db, id, days), assignments };
  });

  app.get("/teacher/materials", async (request) => {
    const me = requirePermission(request, "materials.manage");
    return db.query(
      `SELECT ${MATERIAL_COLUMNS},
              coalesce((SELECT array_agg(ms.class_id) FROM material_shares ms WHERE ms.material_id = m.id), '{}') AS "classIds"
       FROM materials m LEFT JOIN files f ON f.id = m.file_id WHERE m.teacher_id = $1 ORDER BY m.created_at DESC`,
      [me.id],
    );
  });

  app.post("/teacher/materials", async (request, reply) => {
    const me = requirePermission(request, "materials.manage");
    const body = materialCreate.parse(request.body);
    await assertOwnClasses(db, me.id, body.classIds);
    const id = await db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        "INSERT INTO materials (teacher_id, title, kind, url, body) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [me.id, body.title, body.kind, body.kind === "link" ? body.url : null, body.body],
      );
      await shareMaterial(tx, row!.id, body.classIds);
      return row!.id;
    });
    await audit(db, request, "material.criado", { type: "material", id }, { kind: body.kind });
    return reply.code(201).send({ id });
  });

  app.post("/teacher/materials/pdf", async (request, reply) => {
    const me = requirePermission(request, "materials.manage");
    if (!request.isMultipart()) throw badRequest("sem-arquivo", "Envie o PDF como formulário (multipart).");
    const file = await request.file();
    if (!file) throw badRequest("sem-arquivo", "Escolha um arquivo PDF.");
    const data = await file.toBuffer();
    if (!isPdf(data)) throw badRequest("nao-e-pdf", "Esse arquivo não é um PDF.");
    const fields = pdfFields.parse({ title: multipartField(file, "title") ?? file.filename.replace(/\.pdf$/i, ""), classIds: multipartField(file, "classIds") });
    const classIds = z.array(z.uuid()).max(50).parse(fields.classIds.split(",").map((value) => value.trim()).filter(Boolean));
    await assertOwnClasses(db, me.id, classIds);
    const key = newStorageKey();
    await ctx.files.put(key, data);
    try {
      const id = await db.transaction(async (tx) => {
        const [stored] = await tx.query<{ id: string }>(
          "INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key) VALUES ($1, $2, 'application/pdf', $3, $4) RETURNING id",
          [me.id, safeFileName(file.filename), data.length, key],
        );
        const [material] = await tx.query<{ id: string }>(
          "INSERT INTO materials (teacher_id, title, kind, file_id) VALUES ($1, $2, 'pdf', $3) RETURNING id",
          [me.id, fields.title, stored!.id],
        );
        await shareMaterial(tx, material!.id, classIds);
        return material!.id;
      });
      await audit(db, request, "material.pdf-enviado", { type: "material", id }, { bytes: data.length });
      return reply.code(201).send({ id });
    } catch (error) {
      await ctx.files.remove(key);
      throw error;
    }
  });

  app.patch("/teacher/materials/:id", async (request) => {
    const me = requirePermission(request, "materials.manage");
    const { id } = idParams.parse(request.params);
    const body = materialPatch.parse(request.body);
    const [material] = await db.query<{ kind: string }>("SELECT kind FROM materials WHERE id = $1 AND teacher_id = $2", [id, me.id]);
    if (!material) throw notFound("Material não encontrado.");
    if (body.url && material.kind !== "link") throw badRequest("sem-link", "Só materiais do tipo link têm endereço.");
    if (body.classIds) await assertOwnClasses(db, me.id, body.classIds);
    await db.transaction(async (tx) => {
      await tx.query("UPDATE materials SET title = coalesce($2, title), url = coalesce($3, url), body = coalesce($4, body) WHERE id = $1", [
        id,
        body.title ?? null,
        body.url ?? null,
        body.body ?? null,
      ]);
      if (body.classIds) await shareMaterial(tx, id, body.classIds);
    });
    return { ok: true };
  });

  app.delete("/teacher/materials/:id", async (request, reply) => {
    const me = requirePermission(request, "materials.manage");
    const { id } = idParams.parse(request.params);
    const [material] = await db.query<{ file_id: string | null; storage_key: string | null }>(
      "SELECT m.file_id, f.storage_key FROM materials m LEFT JOIN files f ON f.id = m.file_id WHERE m.id = $1 AND m.teacher_id = $2",
      [id, me.id],
    );
    if (!material) throw notFound("Material não encontrado.");
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM materials WHERE id = $1", [id]);
      await tx.query("UPDATE assignments SET material_ids = material_ids - $1::text WHERE material_ids ? $1::text", [id]);
      if (material.file_id) await tx.query("DELETE FROM files WHERE id = $1", [material.file_id]);
    });
    if (material.storage_key) await ctx.files.remove(material.storage_key);
    await audit(db, request, "material.apagado", { type: "material", id });
    return reply.code(204).send();
  });

  app.get("/teacher/assignments", async (request) => {
    const me = requirePermission(request, "assignments.manage");
    const filters = assignmentFilters.parse(request.query);
    return db.query(
      `SELECT a.id, a.title, a.instructions, to_char(a.due_on, 'YYYY-MM-DD') AS "dueOn", a.items, a.material_ids AS "materialIds", a.class_id AS "classId",
              a.student_id AS "studentId", a.created_at AS "createdAt", c.name AS "className", u.name AS "studentName",
              (SELECT count(*)::int FROM assignment_status s WHERE s.assignment_id = a.id AND s.done_at IS NOT NULL) AS done,
              CASE WHEN a.class_id IS NULL THEN 1 ELSE (SELECT count(*)::int FROM class_members m WHERE m.class_id = a.class_id) END AS recipients
       FROM assignments a LEFT JOIN classes c ON c.id = a.class_id LEFT JOIN users u ON u.id = a.student_id
       WHERE a.teacher_id = $1 AND a.archived_at IS NULL
         AND ($2::uuid IS NULL OR a.class_id = $2) AND ($3::uuid IS NULL OR a.student_id = $3)
       ORDER BY a.created_at DESC LIMIT 200`,
      [me.id, filters.classId ?? null, filters.studentId ?? null],
    );
  });

  app.post("/teacher/assignments", async (request, reply) => {
    const me = requirePermission(request, "assignments.manage");
    const body = assignmentCreate.parse(request.body);
    await assertAudience(db, me.id, body);
    await assertOwnMaterials(db, me.id, body.materialIds);
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO assignments (teacher_id, class_id, student_id, title, instructions, due_on, items, material_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb) RETURNING id`,
      [
        me.id,
        body.classId ?? null,
        body.studentId ?? null,
        body.title,
        body.instructions,
        body.dueOn ?? null,
        JSON.stringify(body.items),
        JSON.stringify([...new Set(body.materialIds)]),
      ],
    );
    await audit(db, request, "tarefa.criada", { type: "assignment", id: row!.id });
    return reply.code(201).send({ id: row!.id });
  });

  app.get("/teacher/assignments/:id", async (request) => {
    const me = requirePermission(request, "assignments.manage");
    const { id } = idParams.parse(request.params);
    const assignment = await ownAssignment(db, me.id, id);
    const [detail] = await db.query(
      `SELECT id, title, instructions, to_char(due_on, 'YYYY-MM-DD') AS "dueOn", items, material_ids AS "materialIds", class_id AS "classId",
              student_id AS "studentId", created_at AS "createdAt" FROM assignments WHERE id = $1`,
      [id],
    );
    const students = await db.query(
      `SELECT u.id, u.name, s.done_at AS "doneAt", coalesce(s.student_note, '') AS "studentNote", coalesce(s.feedback, '') AS feedback,
              s.feedback_at AS "feedbackAt"
       FROM users u LEFT JOIN assignment_status s ON s.student_id = u.id AND s.assignment_id = $1
       WHERE u.id = $2 OR u.id IN (SELECT student_id FROM class_members WHERE class_id = $3)
       ORDER BY u.name`,
      [id, assignment.student_id, assignment.class_id],
    );
    return { ...detail, students };
  });

  app.patch("/teacher/assignments/:id", async (request) => {
    const me = requirePermission(request, "assignments.manage");
    const { id } = idParams.parse(request.params);
    const body = assignmentPatch.parse(request.body);
    await ownAssignment(db, me.id, id);
    if (body.materialIds) await assertOwnMaterials(db, me.id, body.materialIds);
    await db.query(
      `UPDATE assignments SET title = coalesce($2, title), instructions = coalesce($3, instructions),
         due_on = CASE WHEN $4::boolean THEN $5::date ELSE due_on END,
         items = coalesce($6::jsonb, items), material_ids = coalesce($7::jsonb, material_ids)
       WHERE id = $1`,
      [
        id,
        body.title ?? null,
        body.instructions ?? null,
        body.dueOn !== undefined,
        body.dueOn ?? null,
        body.items ? JSON.stringify(body.items) : null,
        body.materialIds ? JSON.stringify([...new Set(body.materialIds)]) : null,
      ],
    );
    return { ok: true };
  });

  app.delete("/teacher/assignments/:id", async (request, reply) => {
    const me = requirePermission(request, "assignments.manage");
    const { id } = idParams.parse(request.params);
    await ownAssignment(db, me.id, id);
    await db.query("UPDATE assignments SET archived_at = now() WHERE id = $1", [id]);
    await audit(db, request, "tarefa.arquivada", { type: "assignment", id });
    return reply.code(204).send();
  });

  app.put("/teacher/assignments/:id/students/:studentId/feedback", async (request) => {
    const me = requirePermission(request, "assignments.manage");
    const { id, studentId } = memberParams.parse(request.params);
    const body = feedbackBody.parse(request.body);
    const assignment = await ownAssignment(db, me.id, id);
    const recipient =
      assignment.student_id === studentId ||
      (assignment.class_id !== null &&
        (await db.query("SELECT 1 FROM class_members WHERE class_id = $1 AND student_id = $2", [assignment.class_id, studentId])).length > 0);
    if (!recipient) throw notFound("Esse aluno não recebeu a tarefa.");
    await db.query(
      `INSERT INTO assignment_status (assignment_id, student_id, feedback, feedback_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (assignment_id, student_id) DO UPDATE SET feedback = EXCLUDED.feedback, feedback_at = now()`,
      [id, studentId, body.feedback],
    );
    return { ok: true };
  });

  app.get("/teacher/plans", async (request) => {
    const me = requirePermission(request, "plans.manage");
    return db.query(
      `SELECT p.id, p.name, p.description, p.blocks, p.class_id AS "classId", p.student_id AS "studentId", c.name AS "className",
              u.name AS "studentName", p.updated_at AS "updatedAt"
       FROM study_plans p LEFT JOIN classes c ON c.id = p.class_id LEFT JOIN users u ON u.id = p.student_id
       WHERE p.teacher_id = $1 AND p.archived_at IS NULL ORDER BY p.updated_at DESC`,
      [me.id],
    );
  });

  app.post("/teacher/plans", async (request, reply) => {
    const me = requirePermission(request, "plans.manage");
    const body = planCreate.parse(request.body);
    await assertAudience(db, me.id, body);
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO study_plans (teacher_id, class_id, student_id, name, description, blocks) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
      [me.id, body.classId ?? null, body.studentId ?? null, body.name, body.description, JSON.stringify(body.blocks)],
    );
    await audit(db, request, "plano.criado", { type: "plan", id: row!.id });
    return reply.code(201).send({ id: row!.id });
  });

  app.patch("/teacher/plans/:id", async (request) => {
    const me = requirePermission(request, "plans.manage");
    const { id } = idParams.parse(request.params);
    const body = planPatch.parse(request.body);
    const rows = await db.query(
      `UPDATE study_plans SET name = coalesce($3, name), description = coalesce($4, description), blocks = coalesce($5::jsonb, blocks),
         updated_at = now()
       WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL RETURNING id`,
      [id, me.id, body.name ?? null, body.description ?? null, body.blocks ? JSON.stringify(body.blocks) : null],
    );
    if (rows.length === 0) throw notFound("Plano não encontrado.");
    return { ok: true };
  });

  app.delete("/teacher/plans/:id", async (request, reply) => {
    const me = requirePermission(request, "plans.manage");
    const { id } = idParams.parse(request.params);
    const rows = await db.query("UPDATE study_plans SET archived_at = now() WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL RETURNING id", [
      id,
      me.id,
    ]);
    if (rows.length === 0) throw notFound("Plano não encontrado.");
    return reply.code(204).send();
  });
}
