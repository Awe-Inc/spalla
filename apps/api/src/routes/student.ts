import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AppContext } from "../app.js";
import { requireAuth, requirePermission } from "../auth/session.js";
import { audit } from "../http/audit.js";
import { notFound } from "../http/errors.js";
import { idParams } from "../http/schemas.js";
import { joinClassByCode } from "./auth.js";
import { practiceSummary, STUDENT_ASSIGNMENTS, STUDENT_MATERIAL_IDS } from "./access.js";

const MAX_RESULTS_PER_SYNC = 500;
const MAX_PLAY_SECONDS = 4 * 60 * 60;

const joinBody = z.object({ code: z.string().trim().min(4).max(20) });
const doneBody = z.object({ done: z.boolean(), note: z.string().trim().max(2000).default("") });
const practiceResult = z.object({
  clientId: z.string().trim().min(1).max(80),
  exerciseId: z.string().trim().min(1).max(120).regex(/^[\x21-\x7e]+$/, "Identificador de exercício inválido."),
  playedAt: z.iso.datetime({ offset: true }),
  accuracyPct: z.number().min(0).max(100),
  meanSignedCents: z.number().min(-1200).max(1200),
  bpm: z.number().int().min(10).max(400),
  stars: z.number().int().min(0).max(3),
  durationSeconds: z.number().min(0).max(MAX_PLAY_SECONDS),
});
const practiceBody = z.object({ results: z.array(practiceResult).max(MAX_RESULTS_PER_SYNC) });
const summaryQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

export async function studentRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db } = ctx;

  app.get("/me/classes", async (request) => {
    const me = requireAuth(request);
    return db.query(
      `SELECT c.id, c.name, c.description, u.name AS "teacherName", m.joined_at AS "joinedAt"
       FROM class_members m JOIN classes c ON c.id = m.class_id JOIN users u ON u.id = c.teacher_id
       WHERE m.student_id = $1 AND c.archived_at IS NULL ORDER BY c.name`,
      [me.id],
    );
  });

  const strict = { config: { rateLimit: { max: ctx.config.rateLimitAuthMax, timeWindow: "1 minute" } } };

  app.post("/me/classes/join", strict, async (request, reply) => {
    const me = requireAuth(request);
    const { code } = joinBody.parse(request.body);
    const klass = await db.transaction((tx) => joinClassByCode(tx, me.id, code));
    await audit(db, request, "turma.entrou", { type: "class", id: klass.id });
    return reply.code(201).send(klass);
  });

  app.delete("/me/classes/:id", async (request, reply) => {
    const me = requireAuth(request);
    const { id } = idParams.parse(request.params);
    const rows = await db.query("DELETE FROM class_members WHERE class_id = $1 AND student_id = $2 RETURNING class_id", [id, me.id]);
    if (rows.length === 0) throw notFound("Você não está nessa turma.");
    await audit(db, request, "turma.saiu", { type: "class", id });
    return reply.code(204).send();
  });

  app.get("/me/lessons", async (request) => {
    const me = requirePermission(request, "lessons.read");
    const assignments = await db.query(
      `SELECT a.id, a.title, a.instructions, to_char(a.due_on, 'YYYY-MM-DD') AS "dueOn", a.items, a.material_ids AS "materialIds", a.created_at AS "createdAt",
              c.name AS "className", t.name AS "teacherName", s.done_at AS "doneAt", coalesce(s.student_note, '') AS "studentNote",
              coalesce(s.feedback, '') AS feedback, s.feedback_at AS "feedbackAt"
       FROM (${STUDENT_ASSIGNMENTS}) a
       JOIN users t ON t.id = a.teacher_id
       LEFT JOIN classes c ON c.id = a.class_id
       LEFT JOIN assignment_status s ON s.assignment_id = a.id AND s.student_id = $1
       WHERE a.class_id IS NULL OR c.archived_at IS NULL
       ORDER BY s.done_at NULLS FIRST, a.due_on NULLS LAST, a.created_at DESC LIMIT 200`,
      [me.id],
    );
    const materials = await db.query(
      `SELECT m.id, m.title, m.kind, m.url, m.body, m.file_id AS "fileId", f.name AS "fileName", f.size_bytes AS "fileSize",
              m.created_at AS "createdAt", t.name AS "teacherName"
       FROM materials m JOIN users t ON t.id = m.teacher_id LEFT JOIN files f ON f.id = m.file_id
       WHERE m.id IN (${STUDENT_MATERIAL_IDS}) ORDER BY m.created_at DESC`,
      [me.id],
    );
    const announcements = await db.query(
      `SELECT a.id, a.body, a.created_at AS "createdAt", c.name AS "className", u.name AS "authorName"
       FROM announcements a JOIN classes c ON c.id = a.class_id JOIN users u ON u.id = a.author_id
       JOIN class_members m ON m.class_id = a.class_id AND m.student_id = $1
       WHERE c.archived_at IS NULL ORDER BY a.created_at DESC LIMIT 30`,
      [me.id],
    );
    const plans = await db.query(
      `SELECT p.id, p.name, p.description, p.blocks, p.updated_at AS "updatedAt", t.name AS "teacherName", c.name AS "className"
       FROM study_plans p JOIN users t ON t.id = p.teacher_id LEFT JOIN classes c ON c.id = p.class_id
       WHERE p.archived_at IS NULL
         AND (p.student_id = $1 OR p.class_id IN (
           SELECT m.class_id FROM class_members m JOIN classes k ON k.id = m.class_id WHERE m.student_id = $1 AND k.archived_at IS NULL))
       ORDER BY p.updated_at DESC`,
      [me.id],
    );
    return { assignments, materials, announcements, plans };
  });

  app.put("/me/assignments/:id/status", async (request) => {
    const me = requirePermission(request, "lessons.read");
    const { id } = idParams.parse(request.params);
    const body = doneBody.parse(request.body);
    const visible = await db.query(`SELECT 1 FROM (${STUDENT_ASSIGNMENTS}) a WHERE a.id = $2`, [me.id, id]);
    if (visible.length === 0) throw notFound("Tarefa não encontrada.");
    await db.query(
      `INSERT INTO assignment_status (assignment_id, student_id, done_at, student_note)
       VALUES ($1, $2, CASE WHEN $3::boolean THEN now() END, $4)
       ON CONFLICT (assignment_id, student_id) DO UPDATE
         SET done_at = CASE WHEN $3::boolean THEN coalesce(assignment_status.done_at, now()) END, student_note = EXCLUDED.student_note`,
      [id, me.id, body.done, body.note],
    );
    return { ok: true };
  });

  app.post("/me/practice", async (request) => {
    const me = requirePermission(request, "practice.sync");
    const { results } = practiceBody.parse(request.body);
    const latest = Date.now() + FUTURE_TOLERANCE_MS;
    const accepted = results.filter((result) => Date.parse(result.playedAt) <= latest);
    let inserted = 0;
    await db.transaction(async (tx) => {
      for (const result of accepted) {
        const rows = await tx.query(
          `INSERT INTO practice_results (user_id, client_id, exercise_id, played_at, accuracy_pct, mean_signed_cents, bpm, stars, duration_seconds)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (user_id, client_id) DO NOTHING RETURNING id`,
          [
            me.id,
            result.clientId,
            result.exerciseId,
            result.playedAt,
            result.accuracyPct,
            result.meanSignedCents,
            result.bpm,
            result.stars,
            result.durationSeconds,
          ],
        );
        inserted += rows.length;
      }
    });
    return { received: results.length, inserted, rejected: results.length - accepted.length };
  });

  app.get("/me/practice", async (request) => {
    const me = requireAuth(request);
    const { days } = summaryQuery.parse(request.query);
    return practiceSummary(db, me.id, days);
  });
}
