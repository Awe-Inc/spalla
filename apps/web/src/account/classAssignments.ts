import { useLiveQuery } from "dexie-react-hooks";

import { api, isPlatformEnabled } from "@/api/client";
import type { AssignmentItem, Lessons, StudentAssignment } from "@/api/types";
import { db, type ExerciseResult, type StoredClassAssignment } from "@/data/db";
import type { ClassTaskItem } from "@/data/planner";

import { isStudentUser, useAccount } from "./store";

export const DEFAULT_ITEM_STARS = 1;

export interface ItemProgress {
  item: AssignmentItem;
  met: boolean;
}

export interface AssignmentProgress {
  items: ItemProgress[];
  playable: number;
  met: number;
  hasText: boolean;
  complete: boolean;
}

function isPlayableItem(item: AssignmentItem): item is AssignmentItem & { ref: string } {
  return item.kind !== "texto" && typeof item.ref === "string" && item.ref.length > 0;
}

function byDueOn(a: ClassTaskItem, b: ClassTaskItem): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  return a.createdAt - b.createdAt;
}

export function openClassTasks(assignments: readonly StudentAssignment[]): ClassTaskItem[] {
  return assignments
    .filter((assignment) => assignment.doneAt === null)
    .flatMap((assignment) =>
      assignment.items.filter(isPlayableItem).map<ClassTaskItem>((item) => ({
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        teacherName: assignment.teacherName,
        exerciseId: item.ref,
        bpm: item.bpm ?? null,
        stars: item.stars ?? null,
        dueOn: assignment.dueOn,
        createdAt: Date.parse(assignment.createdAt),
      })),
    )
    .sort(byDueOn);
}

export function itemMet(item: AssignmentItem, results: readonly ExerciseResult[], since: number): boolean {
  if (!isPlayableItem(item)) return false;
  const minStars = item.stars ?? DEFAULT_ITEM_STARS;
  const minBpm = item.bpm ?? 0;
  return results.some((result) => result.exerciseId === item.ref && result.playedAt >= since && result.stars >= minStars && result.bpm >= minBpm);
}

export function assignmentProgress(assignment: StudentAssignment, results: readonly ExerciseResult[]): AssignmentProgress {
  const since = Date.parse(assignment.createdAt);
  const items = assignment.items.map((item) => ({ item, met: itemMet(item, results, since) }));
  const playable = assignment.items.filter(isPlayableItem).length;
  const met = items.filter((entry) => entry.met).length;
  const hasText = assignment.items.some((item) => item.kind === "texto");
  return { items, playable, met, hasText, complete: playable > 0 && met === playable && !hasText };
}

export function assignmentsReadyToComplete(assignments: readonly StudentAssignment[], results: readonly ExerciseResult[], exerciseId?: string): StudentAssignment[] {
  return assignments.filter(
    (assignment) =>
      assignment.doneAt === null &&
      (exerciseId === undefined || assignment.items.some((item) => item.ref === exerciseId)) &&
      assignmentProgress(assignment, results).complete,
  );
}

function canUseClassAssignments(): boolean {
  const { token, user } = useAccount.getState();
  return isPlatformEnabled() && token !== null && isStudentUser(user);
}

export async function storeClassAssignments(assignments: readonly StudentAssignment[]): Promise<void> {
  const syncedAt = Date.now();
  await db.transaction("rw", db.classAssignments, async () => {
    await db.classAssignments.clear();
    await db.classAssignments.bulkPut(assignments.map<StoredClassAssignment>((assignment) => ({ ...assignment, syncedAt })));
  });
}

export async function setAssignmentDone(assignment: Pick<StudentAssignment, "id">, done: boolean, note: string): Promise<void> {
  await api.put(`/me/assignments/${encodeURIComponent(assignment.id)}/status`, { done, note });
  await db.classAssignments.update(assignment.id, { doneAt: done ? new Date().toISOString() : null, studentNote: note });
}

async function completeReady(assignments: readonly StudentAssignment[], exerciseId?: string): Promise<StudentAssignment[]> {
  const refs = [...new Set(assignments.flatMap((assignment) => assignment.items.filter(isPlayableItem).map((item) => item.ref)))];
  if (refs.length === 0) return [];
  const results = await db.results.where("exerciseId").anyOf(refs).toArray();
  const ready = assignmentsReadyToComplete(assignments, results, exerciseId);
  const completed: StudentAssignment[] = [];
  for (const assignment of ready) {
    try {
      await setAssignmentDone(assignment, true, assignment.studentNote);
      completed.push(assignment);
    } catch {
      continue;
    }
  }
  return completed;
}

export async function completeAssignmentsAfterRun(exerciseId: string): Promise<StudentAssignment[]> {
  if (!canUseClassAssignments()) return [];
  return completeReady(await db.classAssignments.toArray(), exerciseId);
}

export async function refreshClassAssignments(lessons?: Lessons, signal?: AbortSignal): Promise<StudentAssignment[]> {
  if (!canUseClassAssignments()) {
    await db.classAssignments.clear();
    return [];
  }
  const fresh = lessons ?? (await api.get<Lessons>("/me/lessons", signal));
  await storeClassAssignments(fresh.assignments);
  return completeReady(fresh.assignments);
}

export function useClassAssignments(): StoredClassAssignment[] {
  return useLiveQuery(() => db.classAssignments.toArray(), []) ?? [];
}
