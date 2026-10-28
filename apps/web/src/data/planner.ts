import type { Exercise } from "@fretless/core";

import type { BlockKind, ExerciseResult, LessonTask, Routine, RoutineBlock } from "./db";
import { BLOCK_KINDS, BLOCK_VARIATIONS } from "./routines";
import { daySeed, pickSeeded, rankBySpacing } from "./spaced";

export const DELIBERATE_BPM_STEP = 5;
export const REVIEW_WEAK_ACCURACY_PCT = 70;
export const LEVEL_LOOKAHEAD = 1;

export interface PlannedBlock {
  block: RoutineBlock;
  exercise: Exercise | null;
  reason: string;
  variation: string | null;
  targetBpm: number | null;
  fromLesson: boolean;
}

export interface PlannerInput {
  routine: Routine;
  exercises: readonly Exercise[];
  best: ReadonlyMap<string, ExerciseResult>;
  latest: ReadonlyMap<string, ExerciseResult>;
  lessonTasks: readonly LessonTask[];
  playedToday: ReadonlySet<string>;
  now: number;
  day: string;
}

export function studentLevel(exercises: readonly Exercise[], best: ReadonlyMap<string, ExerciseResult>): number {
  const reached = exercises.filter((exercise) => (best.get(exercise.id)?.stars ?? 0) >= 2).map((exercise) => exercise.level);
  return reached.length === 0 ? 1 : Math.max(...reached);
}

function withinReach(exercise: Exercise, level: number): boolean {
  return exercise.playable && exercise.level <= level + LEVEL_LOOKAHEAD;
}

function pickReview(candidates: readonly Exercise[], input: PlannerInput, used: ReadonlySet<string>): { exercise: Exercise; reason: string } | null {
  const played = candidates.filter((exercise) => input.latest.has(exercise.id) && !used.has(exercise.id));
  const weak = played.filter((exercise) => (input.latest.get(exercise.id)?.accuracyPct ?? 100) < REVIEW_WEAK_ACCURACY_PCT);
  if (weak.length > 0) {
    const ranked = rankBySpacing(weak, input.best, input.latest, input.now);
    const chosen = ranked[0]?.item;
    if (chosen) return { exercise: chosen, reason: "Ficou abaixo de 70% na última vez." };
  }
  const ranked = rankBySpacing(played, input.best, input.latest, input.now);
  const chosen = ranked[0]?.item;
  return chosen ? { exercise: chosen, reason: "Está na hora de revisitar." } : null;
}

function pickNew(candidates: readonly Exercise[], input: PlannerInput, used: ReadonlySet<string>): { exercise: Exercise; reason: string } | null {
  const fresh = candidates
    .filter((exercise) => !used.has(exercise.id) && (input.best.get(exercise.id)?.stars ?? 0) < 2)
    .sort((a, b) => a.level - b.level || (input.best.has(a.id) ? -1 : 1));
  const chosen = fresh[0];
  return chosen ? { exercise: chosen, reason: input.best.has(chosen.id) ? "Ainda sem duas estrelas." : "Novidade do dia." } : null;
}

function pickSpaced(candidates: readonly Exercise[], input: PlannerInput, used: ReadonlySet<string>): { exercise: Exercise; reason: string } | null {
  const free = candidates.filter((exercise) => !used.has(exercise.id));
  const ranked = rankBySpacing(free, input.best, input.latest, input.now);
  const top = ranked.filter((entry) => entry.priority === ranked[0]?.priority).map((entry) => entry.item);
  const chosen = pickSeeded(top, daySeed(input.day));
  if (!chosen) return null;
  const stars = input.best.get(chosen.id)?.stars ?? 0;
  return { exercise: chosen, reason: stars === 0 ? "Primeira vez." : `${stars} de 3 estrelas.` };
}

function targetBpmFor(exercise: Exercise, best: ExerciseResult | undefined): number | null {
  if (!best || best.stars < 2) return null;
  const next = Math.min(exercise.maxBpm, best.bpm + DELIBERATE_BPM_STEP);
  return next > best.bpm ? next : null;
}

const PICK_ORDER: readonly BlockKind[] = ["revisao", "peca-nova"];

function pickingOrder(blocks: readonly RoutineBlock[]): number[] {
  const rank = (block: RoutineBlock) => {
    const position = PICK_ORDER.indexOf(block.type);
    return position === -1 ? PICK_ORDER.length : position;
  };
  return blocks.map((_, index) => index).sort((a, b) => rank(blocks[a]!) - rank(blocks[b]!) || a - b);
}

export function planSession(input: PlannerInput): PlannedBlock[] {
  const level = studentLevel(input.exercises, input.best);
  const used = new Set<string>();
  const openTasks = input.lessonTasks.filter((task) => task.doneAt === null);
  const planned: PlannedBlock[] = [];

  for (const index of pickingOrder(input.routine.blocks)) {
    const block = input.routine.blocks[index]!;
    const lessonTask = openTasks.find((task) => task.blockType === block.type && task.itemId && !used.has(task.itemId));
    const lessonExercise = lessonTask ? input.exercises.find((exercise) => exercise.id === lessonTask.itemId) : undefined;
    const candidates = input.exercises.filter((exercise) => BLOCK_KINDS[block.type].includes(exercise.kind) && withinReach(exercise, level));

    const playedExercise = candidates.find((exercise) => input.playedToday.has(exercise.id) && !used.has(exercise.id));

    const pick = lessonExercise
      ? { exercise: lessonExercise, reason: `Da aula: ${lessonTask?.text ?? ""}`.trim() }
      : playedExercise
        ? { exercise: playedExercise, reason: "Já tocado hoje." }
        : block.type === "revisao"
        ? pickReview(candidates, input, used)
        : block.type === "peca-nova"
          ? pickNew(candidates, input, used)
          : pickSpaced(candidates, input, used);

    if (pick) used.add(pick.exercise.id);
    const bestResult = pick ? input.best.get(pick.exercise.id) : undefined;
    const variation = pickSeeded(BLOCK_VARIATIONS[block.type], daySeed(input.day) + index) ?? null;
    planned[index] = {
      block: { ...block, itemId: pick?.exercise.id ?? block.itemId, variation: variation ?? undefined },
      exercise: pick?.exercise ?? null,
      reason: pick?.reason ?? "Nada disponível neste nível ainda.",
      variation,
      targetBpm: pick ? targetBpmFor(pick.exercise, bestResult) : null,
      fromLesson: Boolean(lessonExercise),
    };
  }
  return planned;
}

export function nextOpenBlock(plan: readonly PlannedBlock[], doneToday: ReadonlySet<string>): PlannedBlock | null {
  return plan.find((planned) => planned.exercise && !doneToday.has(planned.exercise.id)) ?? null;
}

export function sessionProgress(plan: readonly PlannedBlock[], doneToday: ReadonlySet<string>): { done: number; total: number } {
  const playable = plan.filter((planned) => planned.exercise);
  return { done: playable.filter((planned) => doneToday.has(planned.exercise!.id)).length, total: playable.length };
}
