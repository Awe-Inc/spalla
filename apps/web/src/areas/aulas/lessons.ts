import type { StudentAssignment } from "@/api/types";

const PLAY_PATH = /^\/tocar\/[A-Za-z0-9._:\-/]+$/;

export function safePlayPath(path: string | undefined): string | null {
  if (!path || path.includes("..") || path.includes("//")) return null;
  return PLAY_PATH.test(path) ? path : null;
}

export function safeExternalUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function isOverdue(assignment: Pick<StudentAssignment, "dueOn" | "doneAt">, today: string): boolean {
  return assignment.doneAt === null && assignment.dueOn !== null && assignment.dueOn < today;
}

export function pendingCount(assignments: readonly Pick<StudentAssignment, "doneAt">[]): number {
  return assignments.filter((assignment) => assignment.doneAt === null).length;
}

export function pdfFileName(title: string): string {
  const base = title.replace(/[\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "material";
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

export function doneToggleLabel(done: readonly Pick<StudentAssignment, "feedback">[], showing: boolean): string {
  if (showing) return "Esconder as feitas";
  const withFeedback = done.filter((assignment) => Boolean(assignment.feedback)).length;
  return withFeedback === 0 ? `Ver as feitas (${done.length})` : `Ver as feitas (${done.length}, ${withFeedback} com retorno)`;
}

export function completionMessage(title: string, nextDone: boolean): string {
  return nextDone ? `“${title}” marcada como feita. Seu professor já vê o recado.` : `“${title}” voltou para as pendentes.`;
}
