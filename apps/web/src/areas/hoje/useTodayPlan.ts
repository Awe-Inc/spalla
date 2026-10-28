import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

import { useSettings } from "@/app/settings";
import { useCore } from "@/core/useCore";
import { bestResultsByExercise, currentStreak, db, DEFAULT_USER_STATS, latestResultsByExercise, localDayKey, type ExerciseResult, type Routine, type RoutineBlock, type UserStats } from "@/data/db";
import { blockProgress, nextOpenBlock, planSession, sessionProgress, type PlannedBlock, type RunsByExercise } from "@/data/planner";
import { runsByExercise, shouldRaiseTempo, type GoalProgress } from "@/data/repetitions";
import { defaultRoutines } from "@/data/routines";

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
}

export function useRoutines(): Routine[] {
  const own = useLiveQuery(() => db.routines.toArray(), []) ?? [];
  return useMemo(() => [...defaultRoutines(), ...own], [own]);
}

export function useTodayPlan(): TodayPlan {
  const core = useCore();
  const routineId = useSettings((state) => state.routineId);
  const routines = useRoutines();
  const today = localDayKey(new Date());
  const days = useLiveQuery(() => db.practiceDays.toArray(), []) ?? [];
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];
  const lessonTasks = useLiveQuery(() => db.lessonTasks.toArray(), []) ?? [];
  const stats = useLiveQuery(() => db.userStats.get("me"), []) ?? DEFAULT_USER_STATS;

  const routine = routines.find((item) => item.id === routineId) ?? routines[1] ?? routines[0]!;
  const loadedCore = core.status === "ready" ? core.core : null;
  const exercises = useMemo(() => loadedCore?.exercises ?? [], [loadedCore]);

  const startOfDay = new Date(`${today}T00:00:00`).getTime();
  const runsToday = useMemo(() => runsByExercise(results, startOfDay), [results, startOfDay]);
  const doneToday = useMemo(() => new Set(runsToday.keys()), [runsToday]);

  const plan = useMemo(() => {
    if (exercises.length === 0) return [];
    const best = bestResultsByExercise(results);
    const latest = latestResultsByExercise(results);
    return planSession({ routine, exercises, best, latest, lessonTasks, playedToday: doneToday, now: Date.now(), day: today });
  }, [exercises, results, routine, lessonTasks, doneToday, today]);
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
  };
}

export interface BlockGoal {
  block: RoutineBlock;
  progress: GoalProgress;
  raiseTempo: boolean;
}

export function useBlockGoal(exerciseId: string | null): BlockGoal | null {
  const today = useTodayPlan();
  const allRuns = useLiveQuery(() => (exerciseId ? db.results.where("exerciseId").equals(exerciseId).toArray() : Promise.resolve<ExerciseResult[]>([])), [exerciseId]) ?? [];
  const planned = today.plan.find((item) => item.exercise?.id === exerciseId);
  if (!planned || !exerciseId) return null;
  const progress = blockProgress(planned, today.runsToday);
  if (!progress || planned.block.goal === "uma-vez") return null;
  return { block: planned.block, progress, raiseTempo: progress.complete && shouldRaiseTempo(planned.block, allRuns) };
}
