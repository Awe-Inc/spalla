import type { StoredScrollPlan } from "@/data/db";
import { readingAnchor, scrollForReading } from "@/notation/readingScroll";

import type { Box } from "./fit";

export type ScrollPlan = StoredScrollPlan;

export const DEFAULT_SCROLL_PLAN: ScrollPlan = { measures: 0, beatsPerMeasure: 4, bpm: 80 };
export const PLAN_LIMITS = {
  measures: { min: 1, max: 2000 },
  beatsPerMeasure: { min: 1, max: 16 },
  bpm: { min: 20, max: 300 },
} as const;

const MIN_LEAD_IN_SECONDS = 4;

export function isPlanReady(plan: ScrollPlan): boolean {
  return (Object.keys(PLAN_LIMITS) as (keyof ScrollPlan)[]).every((field) => isFieldValid(field, plan[field]));
}

export function isFieldValid(field: keyof ScrollPlan, value: number): boolean {
  const { min, max } = PLAN_LIMITS[field];
  return Number.isInteger(value) && value >= min && value <= max;
}

export function pieceSeconds(plan: ScrollPlan): number {
  return (plan.measures * plan.beatsPerMeasure * 60) / plan.bpm;
}

export function leadInSeconds(plan: ScrollPlan): number {
  return Math.max(MIN_LEAD_IN_SECONDS, (plan.beatsPerMeasure * 60) / plan.bpm);
}

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

export function advanceProgress(progress: number, elapsedSeconds: number, plan: ScrollPlan): number {
  return clampProgress(progress + elapsedSeconds / pieceSeconds(plan));
}

export function nudgeProgress(progress: number, measures: number, plan: ScrollPlan): number {
  return clampProgress(progress + measures / plan.measures);
}

export function scrollTopAt(progress: number, viewHeight: number, contentHeight: number): number {
  return scrollForReading(progress * contentHeight, viewHeight, contentHeight);
}

export function progressAtScrollTop(scrollTop: number, viewHeight: number, contentHeight: number): number {
  if (scrollTop <= 0 || contentHeight <= 0) return 0;
  return clampProgress((scrollTop + readingAnchor(viewHeight)) / contentHeight);
}

export function bumpBpm(plan: ScrollPlan, delta: number): ScrollPlan {
  const { min, max } = PLAN_LIMITS.bpm;
  return { ...plan, bpm: Math.min(max, Math.max(min, plan.bpm + delta)) };
}

export function formatPieceDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export interface PageStack {
  tops: number[];
  heights: number[];
  contentHeight: number;
}

export function stackPages(sizes: readonly Box[], width: number, gap: number): PageStack {
  const heights = sizes.map((size) => (size.width > 0 ? (size.height / size.width) * width : 0));
  const tops = heights.map((_, index) => heights.slice(0, index).reduce((sum, height) => sum + height + gap, 0));
  const lastTop = tops[tops.length - 1] ?? 0;
  return { tops, heights, contentHeight: lastTop + (heights[heights.length - 1] ?? 0) };
}

export function pageAtY(stack: PageStack, y: number): number {
  const found = stack.tops.reduce((page, top, index) => (top <= y ? index + 1 : page), 1);
  return found;
}

export type RollAction = "toggle" | "faster" | "slower" | "forward" | "back";

const ROLL_KEYS: Record<string, RollAction> = {
  " ": "toggle",
  ArrowUp: "faster",
  ArrowDown: "slower",
  ArrowRight: "forward",
  PageDown: "forward",
  ArrowLeft: "back",
  PageUp: "back",
};

export function keyToRollAction(event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">): RollAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  return ROLL_KEYS[event.key] ?? null;
}
