import { localDayKey, type PracticeDay } from "./db";

export const HEATMAP_WEEKS = 12;
const DAY_MS = 86_400_000;

export interface HeatmapCell {
  day: string;
  minutes: number;
  xp: number;
  goalMet: boolean;
  isFuture: boolean;
}

export type HeatmapWeek = HeatmapCell[];

function startOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

export function heatmapWeeks(days: readonly PracticeDay[], today: Date, weeks = HEATMAP_WEEKS): HeatmapWeek[] {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const todayKey = localDayKey(today);
  const firstWeek = startOfWeek(today);
  firstWeek.setDate(firstWeek.getDate() - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(firstWeek.getTime() + (weekIndex * 7 + weekday) * DAY_MS);
      const key = localDayKey(date);
      const record = byDay.get(key);
      return {
        day: key,
        minutes: record?.minutes ?? 0,
        xp: record?.xp ?? 0,
        goalMet: record?.goalMet ?? false,
        isFuture: key > todayKey,
      };
    }),
  );
}

export function heatLevel(cell: HeatmapCell): 0 | 1 | 2 | 3 {
  if (cell.minutes <= 0) return 0;
  if (cell.goalMet) return 3;
  if (cell.minutes >= 10) return 2;
  return 1;
}

export interface AccuracyPoint {
  playedAt: number;
  accuracyPct: number;
  bpm: number;
}

export function accuracyTrend(points: readonly AccuracyPoint[]): { first: number; last: number; delta: number } | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.playedAt - b.playedAt);
  const first = sorted[0]!.accuracyPct;
  const last = sorted[sorted.length - 1]!.accuracyPct;
  return { first, last, delta: Math.round(last - first) };
}
