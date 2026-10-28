import { db, type BlockKind, type LessonTask } from "./db";

export const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

export function nextLessonSentence(lessonWeekday: number | null, today: Date): string | null {
  if (lessonWeekday === null) return null;
  const daysAhead = (lessonWeekday - today.getDay() + 7) % 7;
  const name = WEEKDAY_NAMES[lessonWeekday] ?? "";
  if (daysAhead === 0) return "Aula hoje.";
  if (daysAhead === 1) return `Próxima aula: amanhã (${name}).`;
  return `Próxima aula: ${name}, em ${daysAhead} dias.`;
}

export function splitTasks(tasks: readonly LessonTask[]): { open: LessonTask[]; done: LessonTask[] } {
  const sorted = [...tasks].sort((a, b) => a.createdAt - b.createdAt);
  return { open: sorted.filter((task) => task.doneAt === null), done: sorted.filter((task) => task.doneAt !== null).reverse() };
}

export async function addLessonTask(text: string, blockType: BlockKind, itemId: string | null): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await db.lessonTasks.add({ text: trimmed, blockType, itemId, createdAt: Date.now(), doneAt: null });
}

export async function toggleLessonTask(task: LessonTask): Promise<void> {
  if (task.id === undefined) return;
  await db.lessonTasks.update(task.id, { doneAt: task.doneAt === null ? Date.now() : null });
}

export async function removeLessonTask(id: number): Promise<void> {
  await db.lessonTasks.delete(id);
}
