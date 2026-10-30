import type { GameStats, NoteJudgement } from "@fretless/core";

import { currentStreak, db, localDayKey, readUserStats, recordResult, starsFor, type ExerciseResult } from "./db";
import { achievementsEarned, creditedAccuracyPct, masteryOfExercise, masteryOfRun, SESSION_COMPLETE_XP, xpForRun, type MasteryLevel } from "./gamification";
import { medalProgress, medalsEarnedCount, missingSentence, nearestMedals, newMedals, rankOf, type EarnedMedal, type Rank } from "./medals";

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
  newMedals: EarnedMedal[];
  closeMedals: string[];
  rankUp: Rank | null;
}

const CLOSE_MEDALS_SHOWN = 2;

export function buildResult(input: RunInput): ExerciseResult {
  const accuracyPct = creditedAccuracyPct(input.stats);
  const stars = starsFor(accuracyPct, input.bpm, input.writtenBpm);
  const base = { accuracyPct, bpm: input.bpm, withDrone: input.withDrone, fromMemory: input.fromMemory };
  return {
    exerciseId: input.exerciseId,
    playedAt: input.playedAt,
    accuracyPct,
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
  const [resultsBefore, daysBefore, statsBefore] = await Promise.all([db.results.toArray(), db.practiceDays.toArray(), readUserStats()]);
  const masteryBefore = masteryOfExercise(resultsBefore.filter((result) => result.exerciseId === input.exerciseId));
  const medalsBefore = medalProgress({ results: resultsBefore, days: daysBefore, frozenDays: statsBefore.frozenDays });
  const result = buildResult(input);
  await recordResult(result);

  const [results, days, stats, unlocked] = await Promise.all([db.results.toArray(), db.practiceDays.toArray(), readUserStats(), db.achievements.toArray()]);
  const streak = currentStreak(days, localDayKey(new Date(input.playedAt)), stats.frozenDays);
  const newAchievements = achievementsEarned(
    { stats: input.stats, judgements: input.judgements, playedAt: new Date(input.playedAt), streak, loopsCompleted: stats.loopsCompleted },
    new Set(unlocked.map((achievement) => achievement.id)),
  );
  if (newAchievements.length > 0) {
    await db.achievements.bulkAdd(newAchievements.map((id) => ({ id, unlockedAt: input.playedAt })));
  }

  const medalsAfter = medalProgress({ results, days, frozenDays: stats.frozenDays });
  const earnedMedals = newMedals(medalsBefore, medalsAfter);
  const rankBefore = rankOf(medalsEarnedCount(medalsBefore)).current;
  const rankAfter = rankOf(medalsEarnedCount(medalsAfter)).current;
  return {
    stars: result.stars,
    xp: result.xpEarned ?? 0,
    mastery: (result.masteryLevel ?? 0) as MasteryLevel,
    masteryBefore,
    newAchievements,
    newMedals: earnedMedals,
    closeMedals: nearestMedals(medalsAfter, CLOSE_MEDALS_SHOWN).map(missingSentence),
    rankUp: rankAfter.minTiers > rankBefore.minTiers ? rankAfter : null,
  };
}

export async function recordLoopCompleted(): Promise<void> {
  await db.transaction("rw", db.userStats, async () => {
    const stats = await readUserStats();
    await db.userStats.put({ ...stats, loopsCompleted: stats.loopsCompleted + 1 });
  });
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

export async function setDailyGoal(dailyGoalXp: number): Promise<void> {
  await db.transaction("rw", db.userStats, async () => {
    const stats = await readUserStats();
    await db.userStats.put({ ...stats, dailyGoalXp });
  });
}
