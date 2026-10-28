import type { ExerciseResult } from "./db";

export const TARGET_INTERVAL_DAYS: Record<0 | 1 | 2 | 3, number> = { 0: 1, 1: 3, 2: 7, 3: 21 };
export const REVIEW_MAX_INTERVAL_DAYS = 30;
export const NEVER_PLAYED_PRIORITY = 2;

const DAY_MS = 86_400_000;

export function daysSince(playedAt: number, now: number): number {
  return Math.max(0, (now - playedAt) / DAY_MS);
}

export function spacedPriority(best: ExerciseResult | undefined, latest: ExerciseResult | undefined, now: number): number {
  if (!best || !latest) return NEVER_PLAYED_PRIORITY;
  const interval = Math.min(TARGET_INTERVAL_DAYS[best.stars], REVIEW_MAX_INTERVAL_DAYS);
  const missingStars = 3 - best.stars;
  return (daysSince(latest.playedAt, now) / interval) * (1 + missingStars);
}

export interface Prioritised<T> {
  item: T;
  priority: number;
}

export function rankBySpacing<T extends { id: string }>(
  items: readonly T[],
  best: ReadonlyMap<string, ExerciseResult>,
  latest: ReadonlyMap<string, ExerciseResult>,
  now: number,
): Prioritised<T>[] {
  return items
    .map((item) => ({ item, priority: spacedPriority(best.get(item.id), latest.get(item.id), now) }))
    .sort((a, b) => b.priority - a.priority);
}

export function daySeed(day: string): number {
  return day.split("").reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
}

export function pickSeeded<T>(items: readonly T[], seed: number): T | undefined {
  if (items.length === 0) return undefined;
  return items[seed % items.length];
}
