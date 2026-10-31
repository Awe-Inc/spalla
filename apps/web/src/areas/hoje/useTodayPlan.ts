import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo } from "react";

import { openClassTasks, useClassAssignments } from "@/account/classAssignments";
import { useSettings } from "@/app/settings";
import { useCore } from "@/core/useCore";
import { bestResultsByExercise, currentStreak, db, DEFAULT_USER_STATS, latestResultsByExercise, localDayKey, type ExerciseResult, type Routine, type RoutineBlock, type UserStats } from "@/data/db";
import { blockProgress, nextOpenBlock, planSession, sessionProgress, type PlannedBlock, type RunsByExercise } from "@/data/planner";
import { runsByExercise, shouldRaiseTempo, type GoalProgress } from "@/data/repetitions";
import { defaultRoutines, type RoutineItem } from "@/data/routines";

export interface TodayPlan {
  today: string;
  routine: Routine;
  routines: Routine[];
  plan: PlannedBlock[];
  runsToday: RunsByExercise;
  next: PlannedBlock | null;
  progress: { done: number; total: number };
  todayXp: number;
  todayMinutes: number;
  sessionCompleted: boolean;
  streak: number;
  stats: UserStats;
  coreReady: boolean;
  coreError: string | null;
}

export function useRoutines(): Routine[] {
  const own = useLiveQuery(() => db.routines.toArray(), []) ?? [];
  return useMemo(() => [...defaultRoutines(), ...own], [own]);
}

export function triedDaysByExercise(results: readonly ExerciseResult[]): Map<string, number> {
  const days = results.reduce((byExercise, result) => {
    const seen = byExercise.get(result.exerciseId) ?? new Set<string>();
    return byExercise.set(result.exerciseId, seen.add(localDayKey(new Date(result.playedAt))));
  }, new Map<string, Set<string>>());
  return new Map([...days].map(([id, seen]) => [id, seen.size]));
}

export function useTodayPlan(): TodayPlan {
  const core = useCore();
  const routineId = useSettings((state) => state.routineId);
  const skippedPieces = useSettings((state) => state.skippedPieces);
  const routines = useRoutines();
  const today = localDayKey(new Date());
  const days = useLiveQuery(() => db.practiceDays.toArray(), []) ?? [];
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];
  const lessonTasks = useLiveQuery(() => db.lessonTasks.toArray(), []) ?? [];
  const stats = useLiveQuery(() => db.userStats.get("me"), []) ?? DEFAULT_USER_STATS;
  const classAssignments = useClassAssignments();
  const classTasks = useMemo(() => openClassTasks(classAssignments), [classAssignments]);

  const routine = routines.find((item) => item.id === routineId) ?? routines[1] ?? routines[0]!;
  const loadedCore = core.status === "ready" ? core.core : null;
  const exercises = useMemo(() => loadedCore?.exercises ?? [], [loadedCore]);

  const startOfDay = new Date(`${today}T00:00:00`).getTime();
  const runsToday = useMemo(() => runsByExercise(results, startOfDay), [results, startOfDay]);
  const doneToday = useMemo(() => new Set(runsToday.keys()), [runsToday]);

  const skipped = useMemo(() => new Set(skippedPieces.day === today ? skippedPieces.ids : []), [skippedPieces, today]);

  const plan = useMemo(() => {
    if (exercises.length === 0) return [];
    const before = results.filter((result) => result.playedAt < startOfDay);
    const best = bestResultsByExercise(before);
    const latest = latestResultsByExercise(before);
    return planSession({ routine, exercises, best, latest, lessonTasks, classTasks, playedToday: doneToday, triedDays: triedDaysByExercise(before), skipped, now: startOfDay, day: today });
  }, [exercises, results, routine, lessonTasks, classTasks, doneToday, skipped, startOfDay, today]);
  const todayRecord = days.find((day) => day.day === today);

  return {
    today,
    routine,
    routines,
    plan,
    runsToday,
    next: nextOpenBlock(plan, runsToday),
    progress: sessionProgress(plan, runsToday),
    todayXp: todayRecord?.xp ?? 0,
    todayMinutes: Math.round(todayRecord?.minutes ?? 0),
    sessionCompleted: todayRecord?.sessionCompleted ?? false,
    streak: currentStreak(days, today, stats.frozenDays),
    stats,
    coreReady: core.status === "ready",
    coreError: core.status === "error" ? core.message : null,
  };
}

export interface BlockGoal {
  block: RoutineBlock;
  progress: GoalProgress;
  raiseTempo: boolean;
}

export interface TodayBlock {
  goal: BlockGoal | null;
  nextBlock: RoutineItem | null;
}

export function useTodayBlock(exerciseId: string | null): TodayBlock {
  const today = useTodayPlan();
  const allRuns = useLiveQuery(() => (exerciseId ? db.results.where("exerciseId").equals(exerciseId).toArray() : Promise.resolve<ExerciseResult[]>([])), [exerciseId]) ?? [];
  const nextItem = today.next?.item ?? null;
  const nextBlock = nextItem && nextItem.id !== exerciseId ? nextItem : null;
  const planned = today.plan.find((item) => item.item?.id === exerciseId);
  if (!planned || !exerciseId) return { goal: null, nextBlock };
  const progress = blockProgress(planned, today.runsToday);
  if (!progress || planned.block.goal === "uma-vez") return { goal: null, nextBlock };
  return { goal: { block: planned.block, progress, raiseTempo: progress.complete && shouldRaiseTempo(planned.block, allRuns) }, nextBlock };
}
