import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

import { useSettings } from "@/app/settings";
import { useCore } from "@/core/useCore";
import { bestResultsByExercise, currentStreak, db, DEFAULT_USER_STATS, latestResultsByExercise, localDayKey, type Routine, type UserStats } from "@/data/db";
import { nextOpenBlock, planSession, sessionProgress, type PlannedBlock } from "@/data/planner";
import { defaultRoutines } from "@/data/routines";

export interface TodayPlan {
  today: string;
  routine: Routine;
  routines: Routine[];
  plan: PlannedBlock[];
  doneToday: Set<string>;
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
  const doneToday = useMemo(() => new Set(results.filter((result) => result.playedAt >= startOfDay).map((result) => result.exerciseId)), [results, startOfDay]);

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
    doneToday,
    next: nextOpenBlock(plan, doneToday),
    progress: sessionProgress(plan, doneToday),
    todayXp: todayRecord?.xp ?? 0,
    todayMinutes: Math.round(todayRecord?.minutes ?? 0),
    sessionCompleted: todayRecord?.sessionCompleted ?? false,
    streak: currentStreak(days, today, stats.frozenDays),
    stats,
    coreReady: core.status === "ready",
  };
}
