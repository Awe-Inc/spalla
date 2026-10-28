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
}

export interface BlockType {
  type:
    | "aquecimento"
    | "afinacao"
    | "escalas"
    | "tecnica"
    | "estudo"
    | "peca-nova"
    | "revisao"
    | "leitura"
    | "livre";
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
}

export interface Setting {
  key: string;
  value: string;
}

export class FretlessDatabase extends Dexie {
  results!: EntityTable<ExerciseResult, "id">;
  routines!: EntityTable<Routine, "id">;
  practiceDays!: EntityTable<PracticeDay, "day">;
  settings!: EntityTable<Setting, "key">;

  constructor(name = "fretless") {
    super(name);
    this.version(1).stores({
      results: "++id, exerciseId, playedAt",
      routines: "++id, name, origin",
      practiceDays: "day",
      settings: "key",
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

export function currentStreak(days: readonly PracticeDay[], today: string): number {
  const practiced = new Set(days.filter((day) => day.minutes > 0).map((day) => day.day));
  let streak = 0;
  let cursor = new Date(`${today}T12:00:00`);
  while (practiced.has(localDayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

export async function recordResult(result: ExerciseResult): Promise<void> {
  const day = localDayKey(new Date(result.playedAt));
  await db.transaction("rw", db.results, db.practiceDays, async () => {
    await db.results.add(result);
    const existing = await db.practiceDays.get(day);
    await db.practiceDays.put({
      day,
      minutes: (existing?.minutes ?? 0) + result.durationSeconds / 60,
      exercisesPlayed: (existing?.exercisesPlayed ?? 0) + 1,
    });
  });
}
