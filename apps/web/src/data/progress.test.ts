import "fake-indexeddb/auto";

import type { GameStats, NoteJudgement } from "@fretless/core";
import { beforeEach, describe, expect, it } from "vitest";

import { db, DEFAULT_USER_STATS, localDayKey } from "./db";
import { SESSION_COMPLETE_XP } from "./gamification";
import { grantSessionBonus, saveRun, setDailyGoal, type RunInput } from "./progress";

const PLAYED_AT = new Date(2026, 9, 30, 19, 0).getTime();
const TODAY = localDayKey(new Date(PLAYED_AT));

function stats(perfect: number, miss: number): GameStats {
  const judgedNotes = perfect + miss;
  return { perfect, great: 0, good: 0, miss, unheard: 0, judgedNotes, accuracyPct: (perfect / judgedNotes) * 100, meanSignedCents: -3, maxCombo: perfect } as unknown as GameStats;
}

function judgements(perfect: number, miss: number): NoteJudgement[] {
  const grades = [...Array<string>(perfect).fill("Perfect"), ...Array<string>(miss).fill("Miss")];
  return grades.map((grade, eventIndex) => ({ eventIndex, grade }) as unknown as NoteJudgement);
}

function run(overrides: Partial<RunInput> = {}): RunInput {
  return {
    exerciseId: "scales.1oct.69",
    stats: stats(19, 1),
    judgements: judgements(19, 1),
    bpm: 60,
    writtenBpm: 60,
    durationSeconds: 90,
    withDrone: false,
    fromMemory: false,
    playedAt: PLAYED_AT,
    ...overrides,
  };
}

describe("progress", () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it("saveRun stores the result and credits the day and the total XP", async () => {
    const outcome = await saveRun(run());

    expect(outcome.stars).toBe(3);
    expect(outcome.xp).toBeGreaterThan(0);
    const [stored] = await db.results.toArray();
    expect(stored).toMatchObject({ exerciseId: "scales.1oct.69", accuracyPct: 95, bpm: 60, perfectNotes: 19, missedNotes: 1 });
    const day = await db.practiceDays.get(TODAY);
    expect(day).toMatchObject({ exercisesPlayed: 1, minutes: 1.5, xp: outcome.xp });
    expect((await db.userStats.get("me"))?.xp).toBe(outcome.xp);
  });

  it("saveRun unlocks an achievement once, not on every run", async () => {
    const lateNight = new Date(2026, 9, 30, 23, 0).getTime();
    const first = await saveRun(run({ playedAt: lateNight }));
    const second = await saveRun(run({ playedAt: lateNight + 60_000 }));

    expect(first.newAchievements).toEqual(["coruja-musical"]);
    expect(second.newAchievements).toEqual([]);
    expect(await db.achievements.count()).toBe(1);
  });

  it("grantSessionBonus pays once per day and can close the daily goal", async () => {
    await setDailyGoal(SESSION_COMPLETE_XP);
    await db.practiceDays.put({ day: TODAY, minutes: 20, exercisesPlayed: 4, xp: 0, goalMet: false });

    expect(await grantSessionBonus(TODAY)).toBe(true);
    expect(await grantSessionBonus(TODAY)).toBe(false);

    expect(await db.practiceDays.get(TODAY)).toMatchObject({ xp: SESSION_COMPLETE_XP, goalMet: true, sessionCompleted: true });
    expect((await db.userStats.get("me"))?.xp).toBe(SESSION_COMPLETE_XP);
  });

  it("grantSessionBonus does nothing on a day nobody played", async () => {
    expect(await grantSessionBonus(TODAY)).toBe(false);
    expect(await db.practiceDays.count()).toBe(0);
    expect(await db.userStats.get("me")).toBeUndefined();
  });

  it("setDailyGoal keeps the rest of the stats", async () => {
    await db.userStats.put({ ...DEFAULT_USER_STATS, xp: 300, loopsCompleted: 2 });
    await setDailyGoal(120);
    expect(await db.userStats.get("me")).toEqual({ ...DEFAULT_USER_STATS, xp: 300, loopsCompleted: 2, dailyGoalXp: 120 });
  });
});
