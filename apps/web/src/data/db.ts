import Dexie, { type EntityTable } from "dexie";

export interface ExerciseResult {
  id?: number;
  exerciseId: string;
  playedAt: number;
  accuracyPct: number;
  meanSignedCents: number;
  bpm: number;
  stars: 0 | 1 | 2 | 3;
  durationSeconds: number;
  xpEarned?: number;
  masteryLevel?: number;
  withDrone?: boolean;
  fromMemory?: boolean;
  perfectNotes?: number;
  missedNotes?: number;
  maxCombo?: number;
}

export type BlockKind = "aquecimento" | "afinacao" | "escalas" | "tecnica" | "estudo" | "peca-nova" | "revisao" | "leitura" | "livre";

export interface BlockType {
  type: BlockKind;
}

export interface RoutineBlock extends BlockType {
  itemId: string;
  goal: "tempo" | "repeticoes-limpas" | "estrelas" | "uma-vez";
  goalValue: number;
  variation?: string;
  durationMinutes: number;
}

export interface Routine {
  id?: number;
  name: string;
  durationMinutes: number;
  blocks: RoutineBlock[];
  origin: "padrao" | "professor" | "propria";
  createdAt: number;
}

export interface PracticeDay {
  day: string;
  minutes: number;
  exercisesPlayed: number;
  xp?: number;
  goalMet?: boolean;
  sessionCompleted?: boolean;
}

export interface UserStats {
  key: "me";
  xp: number;
  dailyGoalXp: number;
  frozenDays: string[];
  loopsCompleted: number;
}

export interface Achievement {
  id: string;
  unlockedAt: number;
}

export interface LessonTask {
  id?: number;
  text: string;
  blockType: BlockKind;
  itemId: string | null;
  createdAt: number;
  doneAt: number | null;
}

export interface StoredPiece {
  id?: number;
  fileName: string;
  title: string;
  composer: string;
  genre: string;
  level: number;
  bytes: Uint8Array;
  noteCount: number;
  beatsPerMinute: number;
  importedAt: number;
}

export interface StoredSheet {
  id?: number;
  fileName: string;
  title: string;
  pageCount: number;
  lastPage: number;
  importedAt: number;
  openedAt: number;
}

export interface StoredSheetFile {
  id: number;
  bytes: Uint8Array;
}

export const DEFAULT_DAILY_GOAL_XP = 60;

export const DEFAULT_USER_STATS: UserStats = {
  key: "me",
  xp: 0,
  dailyGoalXp: DEFAULT_DAILY_GOAL_XP,
  frozenDays: [],
  loopsCompleted: 0,
};

export interface StoredSuzukiPiece {
  key: string;
  book: number;
  name: string;
  learnedAt: number;
  lastReviewedAt: number;
  reviewCount: number;
}

export class FretlessDatabase extends Dexie {
  results!: EntityTable<ExerciseResult, "id">;
  routines!: EntityTable<Routine, "id">;
  practiceDays!: EntityTable<PracticeDay, "day">;
  userStats!: EntityTable<UserStats, "key">;
  achievements!: EntityTable<Achievement, "id">;
  lessonTasks!: EntityTable<LessonTask, "id">;
  pieces!: EntityTable<StoredPiece, "id">;
  sheets!: EntityTable<StoredSheet, "id">;
  sheetFiles!: EntityTable<StoredSheetFile, "id">;
  suzukiPieces!: EntityTable<StoredSuzukiPiece, "key">;

  constructor(name = "fretless") {
    super(name);
    this.version(1).stores({
      results: "++id, exerciseId, playedAt",
      routines: "++id, name, origin",
      practiceDays: "day",
      settings: "key",
    });
    this.version(2).stores({
      results: "++id, exerciseId, playedAt",
      routines: "++id, name, origin",
      practiceDays: "day",
      settings: "key",
      userStats: "key",
      achievements: "id",
      lessonTasks: "++id, createdAt, doneAt",
      pieces: "++id, fileName, title, composer, genre, level",
    });
    this.version(3).stores({
      pieces: "++id, fileName, title, composer, genre, level, importedAt",
    });
    this.version(4).stores({
      sheets: "++id, fileName, title, importedAt, openedAt",
      sheetFiles: "id",
    });
    this.version(5).stores({
      settings: null,
    });
    this.version(6).stores({
      suzukiPieces: "key, book, learnedAt",
    });
  }
}

export const db = new FretlessDatabase();

export function bestResultsByExercise(results: readonly ExerciseResult[]): Map<string, ExerciseResult> {
  return results.reduce((best, result) => {
    const current = best.get(result.exerciseId);
    if (!current || result.stars > current.stars || (result.stars === current.stars && result.accuracyPct > current.accuracyPct)) {
      best.set(result.exerciseId, result);
    }
    return best;
  }, new Map<string, ExerciseResult>());
}

export function latestResultsByExercise(results: readonly ExerciseResult[]): Map<string, ExerciseResult> {
  return results.reduce((latest, result) => {
    const current = latest.get(result.exerciseId);
    if (!current || result.playedAt > current.playedAt) latest.set(result.exerciseId, result);
    return latest;
  }, new Map<string, ExerciseResult>());
}

export function starsFor(accuracyPct: number, bpm: number, writtenBpm: number): 0 | 1 | 2 | 3 {
  if (accuracyPct >= 95 && bpm >= writtenBpm) return 3;
  if (accuracyPct >= 80) return 2;
  if (accuracyPct > 0) return 1;
  return 0;
}

export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dayBefore(day: string): string {
  return localDayKey(new Date(new Date(`${day}T12:00:00`).getTime() - 86_400_000));
}

export function currentStreak(days: readonly PracticeDay[], today: string, frozenDays: readonly string[] = []): number {
  const counted = new Set(days.filter((day) => day.minutes > 0).map((day) => day.day));
  const frozen = new Set(frozenDays);
  let streak = 0;
  let cursor = today;
  if (!counted.has(cursor) && !frozen.has(cursor)) cursor = dayBefore(cursor);
  while (counted.has(cursor) || frozen.has(cursor)) {
    if (counted.has(cursor)) streak += 1;
    cursor = dayBefore(cursor);
  }
  return streak;
}

export async function readUserStats(): Promise<UserStats> {
  return (await db.userStats.get("me")) ?? DEFAULT_USER_STATS;
}

export async function recordResult(result: ExerciseResult): Promise<void> {
  const day = localDayKey(new Date(result.playedAt));
  await db.transaction("rw", db.results, db.practiceDays, db.userStats, async () => {
    await db.results.add(result);
    const existing = await db.practiceDays.get(day);
    const stats = (await db.userStats.get("me")) ?? DEFAULT_USER_STATS;
    const xp = (existing?.xp ?? 0) + (result.xpEarned ?? 0);
    await db.practiceDays.put({
      ...existing,
      day,
      minutes: (existing?.minutes ?? 0) + result.durationSeconds / 60,
      exercisesPlayed: (existing?.exercisesPlayed ?? 0) + 1,
      xp,
      goalMet: xp >= stats.dailyGoalXp,
    });
    await db.userStats.put({ ...stats, xp: stats.xp + (result.xpEarned ?? 0) });
  });
}
