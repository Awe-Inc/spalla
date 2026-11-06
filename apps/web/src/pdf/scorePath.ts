import type { PageStack, ReadingMap } from "./autoScroll";
import { performancePath } from "./omr/performancePath";
import type { ScoreMeasure } from "./omr/structure";

const LONGEST_GLIDE_OF_A_MEASURE = 0.5;
const NOTICE_MEASURES_AHEAD = 1;

export interface PlacedMeasure {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly flowTop: number;
  readonly flowBottom: number;
  readonly flowLeft: number;
  readonly flowRight: number;
}

export interface ScoreTimeline {
  readonly measures: readonly ScoreMeasure[];
  readonly placed: readonly PlacedMeasure[];
  readonly order: readonly number[];
}

export interface PathNotice {
  readonly text: string;
  readonly target: number | null;
}

function sameSystem(a: ScoreMeasure, b: ScoreMeasure): boolean {
  return a.page === b.page && a.system === b.system;
}

export function placeMeasures(measures: readonly ScoreMeasure[], stack: PageStack, width: number): PlacedMeasure[] {
  const absoluteTop = (measure: ScoreMeasure) => (stack.tops[measure.page] ?? 0) + measure.top * (stack.heights[measure.page] ?? 0);
  const absoluteBottom = (measure: ScoreMeasure) => (stack.tops[measure.page] ?? 0) + measure.bottom * (stack.heights[measure.page] ?? 0);
  return measures.map((measure) => {
    const inSystem = measures.filter((other) => sameSystem(other, measure));
    const lastOfSystem = inSystem[inSystem.length - 1] ?? measure;
    const following = measures[measures.indexOf(lastOfSystem) + 1];
    return {
      left: measure.x0 * width,
      right: measure.x1 * width,
      top: absoluteTop(measure),
      bottom: absoluteBottom(measure),
      flowTop: absoluteTop(measure),
      flowBottom: following ? absoluteTop(following) : absoluteBottom(measure),
      flowLeft: (inSystem[0]?.x0 ?? measure.x0) * width,
      flowRight: lastOfSystem.x1 * width,
    };
  });
}

export function buildTimeline(measures: readonly ScoreMeasure[], stack: PageStack, width: number): ScoreTimeline {
  return { measures, placed: placeMeasures(measures, stack, width), order: performancePath(measures) };
}

function yInsideMeasure(placed: PlacedMeasure, fraction: number): number {
  const span = placed.flowRight - placed.flowLeft;
  const across = span > 0 ? (placed.left + fraction * (placed.right - placed.left) - placed.flowLeft) / span : 0;
  return placed.flowTop + across * (placed.flowBottom - placed.flowTop);
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function stepAt(timeline: ScoreTimeline, progress: number): { step: number; fraction: number } {
  const total = timeline.order.length;
  const position = Math.min(total, Math.max(0, progress * total));
  const step = Math.min(total - 1, Math.floor(position));
  return { step, fraction: position - step };
}

export function currentMeasure(timeline: ScoreTimeline, progress: number): number {
  return timeline.order[stepAt(timeline, progress).step] ?? 0;
}

function isJump(order: readonly number[], step: number): boolean {
  const measure = order[step];
  const next = order[step + 1];
  return measure !== undefined && next !== undefined && next !== measure + 1;
}

export function readingYAt(timeline: ScoreTimeline, progress: number, beatsPerMeasure: number): number {
  const { step, fraction } = stepAt(timeline, progress);
  const placed = timeline.placed[timeline.order[step] ?? 0];
  if (!placed) return 0;
  const glide = Math.min(LONGEST_GLIDE_OF_A_MEASURE, 1 / Math.max(1, beatsPerMeasure));
  if (!isJump(timeline.order, step) || fraction <= 1 - glide) return yInsideMeasure(placed, fraction);
  const destination = timeline.placed[timeline.order[step + 1] ?? 0];
  if (!destination) return yInsideMeasure(placed, fraction);
  const from = yInsideMeasure(placed, 1 - glide);
  return from + (destination.flowTop - from) * smoothStep((fraction - (1 - glide)) / glide);
}

function measureAtY(timeline: ScoreTimeline, y: number): { measure: number; fraction: number } {
  const { placed } = timeline;
  const first = placed[0];
  if (!first || y <= first.flowTop) return { measure: 0, fraction: 0 };
  const line = placed.find((candidate) => y >= candidate.flowTop && y < candidate.flowBottom);
  if (!line) return { measure: placed.length - 1, fraction: 1 };
  const across = (y - line.flowTop) / (line.flowBottom - line.flowTop);
  const x = line.flowLeft + across * (line.flowRight - line.flowLeft);
  const measure = placed.findIndex((candidate) => candidate.flowTop === line.flowTop && x >= candidate.left && x < candidate.right);
  if (measure < 0) return { measure: placed.lastIndexOf(line), fraction: 1 };
  const hit = placed[measure] as PlacedMeasure;
  return { measure, fraction: (x - hit.left) / (hit.right - hit.left) };
}

export function progressAtReadingY(timeline: ScoreTimeline, y: number, currentProgress: number): number {
  const { measure, fraction } = measureAtY(timeline, y);
  const { step: currentStep } = stepAt(timeline, currentProgress);
  const occurrences = timeline.order.flatMap((candidate, step) => (candidate === measure ? [step] : []));
  if (occurrences.length === 0) return currentProgress;
  const step = occurrences.find((candidate) => candidate >= currentStep) ?? (occurrences[0] as number);
  return (step + fraction) / timeline.order.length;
}

export function readingMapOf(timeline: ScoreTimeline, beatsPerMeasure: number): ReadingMap {
  return {
    yAt: (progress) => readingYAt(timeline, progress, beatsPerMeasure),
    progressAt: (y, current) => progressAtReadingY(timeline, y, current),
  };
}

function jumpLabel(measure: ScoreMeasure | undefined): string {
  if (measure?.dalSegno) return "D.S.";
  if (measure?.daCapo) return "D.C.";
  if (measure?.toCoda) return "Coda";
  if (measure?.repeatEnd) return "Repetição";
  return "Casa";
}

function noticeOfStep(timeline: ScoreTimeline, step: number): PathNotice | null {
  const { order, measures } = timeline;
  const from = order[step];
  if (from === undefined) return null;
  const next = order[step + 1];
  if (next === undefined) {
    return from === measures.length - 1 ? null : { text: `Fine: termina no compasso ${from + 1}`, target: null };
  }
  if (next === from + 1) return null;
  const verb = next <= from ? "volta ao" : "salta para o";
  return { text: `${jumpLabel(measures[from])}: ${verb} compasso ${next + 1}`, target: next };
}

export function upcomingNotice(timeline: ScoreTimeline, progress: number): PathNotice | null {
  const { step } = stepAt(timeline, progress);
  for (let ahead = 0; ahead <= NOTICE_MEASURES_AHEAD; ahead += 1) {
    const notice = noticeOfStep(timeline, step + ahead);
    if (notice) return notice;
  }
  return null;
}

export function pathRanges(order: readonly number[]): string {
  const ranges: Array<[number, number]> = [];
  for (const measure of order) {
    const last = ranges[ranges.length - 1];
    if (last && measure === last[1] + 1) last[1] = measure;
    else ranges.push([measure, measure]);
  }
  return ranges.map(([from, to]) => (from === to ? `${from + 1}` : `${from + 1}–${to + 1}`)).join(", ");
}
