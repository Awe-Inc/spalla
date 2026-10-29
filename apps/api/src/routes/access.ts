import type { Queryable } from "../db/db.js";
import { badRequest, notFound } from "../http/errors.js";

export const TIME_ZONE = "America/Sao_Paulo";

export const STUDENT_ASSIGNMENTS = `
  SELECT a.* FROM assignments a
  WHERE a.archived_at IS NULL
    AND (a.student_id = $1 OR a.class_id IN (SELECT class_id FROM class_members WHERE student_id = $1))`;

export const STUDENT_MATERIAL_IDS = `
  SELECT ms.material_id AS id FROM material_shares ms
  JOIN class_members cm ON cm.class_id = ms.class_id AND cm.student_id = $1
  JOIN classes c ON c.id = ms.class_id AND c.archived_at IS NULL
  UNION
  SELECT (jsonb_array_elements_text(sa.material_ids))::uuid AS id FROM (${STUDENT_ASSIGNMENTS}) sa`;

export async function ownClass(db: Queryable, teacherId: string, classId: string): Promise<{ id: string; name: string }> {
  const [klass] = await db.query<{ id: string; name: string }>("SELECT id, name FROM classes WHERE id = $1 AND teacher_id = $2", [classId, teacherId]);
  if (!klass) throw notFound("Turma não encontrada.");
  return klass;
}

export async function isMyStudent(db: Queryable, teacherId: string, studentId: string): Promise<boolean> {
  const rows = await db.query(
    "SELECT 1 FROM class_members m JOIN classes c ON c.id = m.class_id WHERE c.teacher_id = $1 AND m.student_id = $2 LIMIT 1",
    [teacherId, studentId],
  );
  return rows.length > 0;
}

export async function assertMyStudent(db: Queryable, teacherId: string, studentId: string): Promise<void> {
  if (!(await isMyStudent(db, teacherId, studentId))) throw notFound("Aluno não encontrado nas suas turmas.");
}

export async function assertOwnMaterials(db: Queryable, teacherId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const [row] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM materials WHERE teacher_id = $1 AND id = ANY($2::uuid[])", [teacherId, ids]);
  if ((row?.n ?? 0) !== new Set(ids).size) throw badRequest("material-invalido", "Algum material escolhido não é seu.");
}

export async function assertOwnClasses(db: Queryable, teacherId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const [row] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM classes WHERE teacher_id = $1 AND id = ANY($2::uuid[])", [teacherId, ids]);
  if ((row?.n ?? 0) !== new Set(ids).size) throw badRequest("turma-invalida", "Alguma turma escolhida não é sua.");
}

export async function practiceSummary(db: Queryable, studentId: string, days: number) {
  const byDay = await db.query<{ day: string; minutes: number; plays: number }>(
    `SELECT to_char(played_at AT TIME ZONE '${TIME_ZONE}', 'YYYY-MM-DD') AS day,
            round(sum(duration_seconds) / 60)::int AS minutes, count(*)::int AS plays
     FROM practice_results WHERE user_id = $1 AND played_at > now() - make_interval(days => $2)
     GROUP BY 1 ORDER BY 1`,
    [studentId, days],
  );
  const exercises = await db.query(
    `SELECT exercise_id AS "exerciseId", count(*)::int AS plays, round(max(accuracy_pct))::int AS "bestAccuracy",
            round(avg(mean_signed_cents))::int AS "meanDriftCents", max(stars)::int AS stars, max(bpm)::int AS "bestBpm",
            max(played_at) AS "lastPlayedAt"
     FROM practice_results WHERE user_id = $1 AND played_at > now() - make_interval(days => $2)
     GROUP BY exercise_id ORDER BY max(played_at) DESC LIMIT 60`,
    [studentId, days],
  );
  const [last] = await db.query<{ at: Date | null }>("SELECT max(played_at) AS at FROM practice_results WHERE user_id = $1", [studentId]);
  return {
    days,
    totalMinutes: byDay.reduce((sum, day) => sum + day.minutes, 0),
    daysPracticed: byDay.length,
    lastPracticeAt: last?.at ?? null,
    byDay,
    exercises,
  };
}
