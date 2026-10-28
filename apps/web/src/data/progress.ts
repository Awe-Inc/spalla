import type { GameStats, NoteJudgement } from "@fretless/core";

import { currentStreak, db, localDayKey, readUserStats, recordResult, starsFor, type ExerciseResult } from "./db";
import { achievementsEarned, masteryOfExercise, masteryOfRun, SESSION_COMPLETE_XP, xpForRun, type MasteryLevel } from "./gamification";

export interface RunInput {
  exerciseId: string;
  stats: GameStats;
  judgements: readonly NoteJudgement[];
  bpm: number;
  writtenBpm: number;
  durationSeconds: number;
  withDrone: boolean;
  fromMemory: boolean;
  playedAt: number;
}

export interface RunOutcome {
  stars: 0 | 1 | 2 | 3;
  xp: number;
  mastery: MasteryLevel;
  masteryBefore: MasteryLevel;
  newAchievements: string[];
}

export function buildResult(input: RunInput): ExerciseResult {
  const stars = starsFor(input.stats.accuracyPct, input.bpm, input.writtenBpm);
  const base = { accuracyPct: input.stats.accuracyPct, bpm: input.bpm, withDrone: input.withDrone, fromMemory: input.fromMemory };
  return {
    exerciseId: input.exerciseId,
    playedAt: input.playedAt,
    accuracyPct: input.stats.accuracyPct,
    meanSignedCents: input.stats.meanSignedCents,
    bpm: input.bpm,
    stars,
    durationSeconds: input.durationSeconds,
    xpEarned: xpForRun(input.judgements),
    masteryLevel: masteryOfRun(base, input.writtenBpm),
    withDrone: input.withDrone,
    fromMemory: input.fromMemory,
    perfectNotes: input.stats.perfect,
    missedNotes: input.stats.miss,
    maxCombo: input.stats.maxCombo,
  };
}

export async function saveRun(input: RunInput): Promise<RunOutcome> {
  const previous = await db.results.where("exerciseId").equals(input.exerciseId).toArray();
  const masteryBefore = masteryOfExercise(previous);
  const result = buildResult(input);
  await recordResult(result);

  const [days, stats, unlocked] = await Promise.all([db.practiceDays.toArray(), readUserStats(), db.achievements.toArray()]);
  const streak = currentStreak(days, localDayKey(new Date(input.playedAt)), stats.frozenDays);
  const newAchievements = achievementsEarned(
    { stats: input.stats, judgements: input.judgements, playedAt: new Date(input.playedAt), streak, loopsCompleted: stats.loopsCompleted },
    new Set(unlocked.map((achievement) => achievement.id)),
  );
  if (newAchievements.length > 0) {
    await db.achievements.bulkAdd(newAchievements.map((id) => ({ id, unlockedAt: input.playedAt })));
  }

  return { stars: result.stars, xp: result.xpEarned ?? 0, mastery: (result.masteryLevel ?? 0) as MasteryLevel, masteryBefore, newAchievements };
}

export async function recordLoopCompleted(): Promise<void> {
  const stats = await readUserStats();
  await db.userStats.put({ ...stats, loopsCompleted: stats.loopsCompleted + 1 });
}

export async function grantSessionBonus(day: string): Promise<boolean> {
  return db.transaction("rw", db.practiceDays, db.userStats, async () => {
    const existing = await db.practiceDays.get(day);
    if (!existing || existing.sessionCompleted) return false;
    const stats = await readUserStats();
    const xp = (existing.xp ?? 0) + SESSION_COMPLETE_XP;
    await db.practiceDays.put({ ...existing, xp, goalMet: xp >= stats.dailyGoalXp, sessionCompleted: true });
    await db.userStats.put({ ...stats, xp: stats.xp + SESSION_COMPLETE_XP });
    return true;
  });
}

export async function useFreezer(day: string): Promise<boolean> {
  return db.transaction("rw", db.userStats, async () => {
    const stats = await readUserStats();
    if (stats.freezers <= 0 || stats.frozenDays.includes(day)) return false;
    await db.userStats.put({ ...stats, freezers: stats.freezers - 1, frozenDays: [...stats.frozenDays, day] });
    return true;
  });
}

export async function buyItem(itemId: string, price: number): Promise<boolean> {
  return db.transaction("rw", db.userStats, async () => {
    const stats = await readUserStats();
    if (stats.resinas < price) return false;
    const isFreezer = itemId === "freezer";
    if (!isFreezer && stats.unlockedItems.includes(itemId)) return false;
    await db.userStats.put({
      ...stats,
      resinas: stats.resinas - price,
      freezers: isFreezer ? stats.freezers + 1 : stats.freezers,
      unlockedItems: isFreezer ? stats.unlockedItems : [...stats.unlockedItems, itemId],
    });
    return true;
  });
}
