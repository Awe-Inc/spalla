import type { ExerciseKind } from "@fretless/core";

import { db, type BlockKind, type Routine, type RoutineBlock } from "./db";
import { DEFAULT_CLEAN_REPETITIONS } from "./repetitions";

export const BLOCK_LABELS: Record<BlockKind, string> = {
  aquecimento: "Aquecimento",
  afinacao: "Afinação",
  escalas: "Escalas e arpejos",
  tecnica: "Técnica ou estudo",
  estudo: "Estudo",
  "peca-nova": "Peça nova",
  revisao: "Revisão",
  leitura: "Leitura",
  livre: "Livre",
};

export const BLOCK_KINDS: Record<BlockKind, readonly ExerciseKind[]> = {
  aquecimento: ["long-tone", "single-string"],
  afinacao: ["ring-tone", "drone-interval"],
  escalas: ["scale", "finger-pattern"],
  tecnica: ["string-crossing", "rhythm", "finger-pattern"],
  estudo: ["string-crossing", "rhythm"],
  "peca-nova": ["piece"],
  revisao: ["piece"],
  leitura: ["sight-reading", "interval-reading"],
  livre: [],
};

export const BLOCK_VARIATIONS: Record<BlockKind, readonly string[]> = {
  aquecimento: ["arco inteiro, bem lento", "só a metade de cima do arco", "olhando a mão esquerda"],
  afinacao: ["segure cada nota até parar de oscilar", "cante antes de tocar", "feche os olhos na nota pedal"],
  escalas: ["duas notas por arco", "quatro notas por arco", "subindo lento, descendo no andamento"],
  tecnica: ["metade do andamento", "só o trecho difícil", "contando em voz alta"],
  estudo: ["metade do andamento", "só o trecho difícil"],
  "peca-nova": ["leia um compasso de cada vez", "primeiro só o ritmo", "cante a melodia antes"],
  revisao: ["de cor, sem olhar a pauta", "com a nota pedal", "no andamento escrito"],
  leitura: ["sem parar nos erros", "olhando um compasso adiante"],
  livre: [],
};

export const ROUTINE_ORDER: readonly BlockKind[] = ["aquecimento", "afinacao", "escalas", "tecnica", "peca-nova", "revisao", "leitura"];

export type RoutineMinutes = Partial<Record<BlockKind, number>>;

export const DEFAULT_ROUTINE_MINUTES: Record<15 | 25 | 45, RoutineMinutes> = {
  15: { aquecimento: 2, afinacao: 2, escalas: 3, tecnica: 2, "peca-nova": 4, revisao: 2 },
  25: { aquecimento: 3, afinacao: 3, escalas: 5, tecnica: 4, "peca-nova": 6, revisao: 3, leitura: 1 },
  45: { aquecimento: 5, afinacao: 5, escalas: 9, tecnica: 8, "peca-nova": 10, revisao: 6, leitura: 2 },
};

const REPEATED_BLOCKS: readonly BlockKind[] = ["escalas", "tecnica", "estudo"];

export function goalFor(type: BlockKind): Pick<RoutineBlock, "goal" | "goalValue"> {
  return REPEATED_BLOCKS.includes(type) ? { goal: "repeticoes-limpas", goalValue: DEFAULT_CLEAN_REPETITIONS } : { goal: "uma-vez", goalValue: 1 };
}

export function blocksFromMinutes(minutes: RoutineMinutes): RoutineBlock[] {
  return ROUTINE_ORDER.flatMap((type) => {
    const durationMinutes = minutes[type] ?? 0;
    if (durationMinutes <= 0) return [];
    return [{ type, itemId: "", ...goalFor(type), durationMinutes }];
  });
}

export function totalMinutes(blocks: readonly RoutineBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.durationMinutes, 0);
}

export function defaultRoutines(): Routine[] {
  return ([15, 25, 45] as const).map((minutes) => ({
    id: -minutes,
    name: `Rotina de ${minutes} minutos`,
    durationMinutes: minutes,
    blocks: blocksFromMinutes(DEFAULT_ROUTINE_MINUTES[minutes]),
    origin: "padrao",
    createdAt: 0,
  }));
}

export const DEFAULT_ROUTINE_ID = -25;

export function hasRepeatedNeighbours(blocks: readonly RoutineBlock[]): boolean {
  return blocks.some((block, index) => index > 0 && blocks[index - 1]?.type === block.type);
}

export type RoutineGoal = RoutineBlock["goal"];

export const GOAL_LABELS: Record<RoutineGoal, string> = {
  "uma-vez": "Tocar uma vez",
  "repeticoes-limpas": "Repetições limpas seguidas",
  estrelas: "Chegar às estrelas",
  tempo: "Cumprir os minutos",
};

export const GOAL_ORDER: readonly RoutineGoal[] = ["uma-vez", "repeticoes-limpas", "estrelas", "tempo"];

export const GOAL_VALUE_RANGE: Partial<Record<RoutineGoal, { min: number; max: number }>> = {
  "repeticoes-limpas": { min: 2, max: 6 },
  estrelas: { min: 1, max: 3 },
};

export const NEW_BLOCK_MINUTES = 3;
export const MAX_BLOCK_MINUTES = 30;

function defaultGoalValue(goal: RoutineGoal): number {
  if (goal === "repeticoes-limpas") return DEFAULT_CLEAN_REPETITIONS;
  if (goal === "estrelas") return 2;
  return 1;
}

export function clampGoalValue(goal: RoutineGoal, value: number): number {
  const range = GOAL_VALUE_RANGE[goal];
  if (!range) return defaultGoalValue(goal);
  return Math.max(range.min, Math.min(range.max, Math.round(value)));
}

export function moveBlock(blocks: readonly RoutineBlock[], from: number, to: number): RoutineBlock[] {
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return [...blocks];
  const moving = blocks[from]!;
  const without = blocks.filter((_, index) => index !== from);
  return [...without.slice(0, to), moving, ...without.slice(to)];
}

export function addBlock(blocks: readonly RoutineBlock[], type: BlockKind): RoutineBlock[] {
  return [...blocks, { type, itemId: "", ...goalFor(type), durationMinutes: NEW_BLOCK_MINUTES }];
}

export function removeBlock(blocks: readonly RoutineBlock[], index: number): RoutineBlock[] {
  return blocks.filter((_, position) => position !== index);
}

export function updateBlock(blocks: readonly RoutineBlock[], index: number, patch: Partial<RoutineBlock>): RoutineBlock[] {
  return blocks.map((block, position) => (position === index ? { ...block, ...patch } : block));
}

export function setBlockMinutes(blocks: readonly RoutineBlock[], index: number, minutes: number): RoutineBlock[] {
  const durationMinutes = Math.max(1, Math.min(MAX_BLOCK_MINUTES, Math.round(Number.isFinite(minutes) ? minutes : 1)));
  return updateBlock(blocks, index, { durationMinutes });
}

export function setBlockGoal(blocks: readonly RoutineBlock[], index: number, goal: RoutineGoal, goalValue?: number): RoutineBlock[] {
  const current = blocks[index];
  const sameGoal = current?.goal === goal;
  const value = goalValue ?? (sameGoal ? current.goalValue : defaultGoalValue(goal));
  return updateBlock(blocks, index, { goal, goalValue: clampGoalValue(goal, value) });
}

export interface RoutineItem {
  id: string;
  title: string;
  playPath: string;
}

export const PINNABLE_TYPES: readonly BlockKind[] = ["peca-nova", "revisao"];
export const PINNED_BLOCK_MINUTES = 5;

export function pinnedItem(block: RoutineBlock): RoutineItem | null {
  if (!block.itemId || !block.itemPath) return null;
  return { id: block.itemId, title: block.itemTitle ?? block.itemId, playPath: block.itemPath };
}

export function routineHasItem(routine: Routine, itemId: string): boolean {
  return routine.blocks.some((block) => pinnedItem(block)?.id === itemId);
}

export function withPinnedItem(blocks: readonly RoutineBlock[], item: RoutineItem, type: BlockKind): RoutineBlock[] {
  if (blocks.some((block) => pinnedItem(block)?.id === item.id)) return [...blocks];
  const pin = { itemId: item.id, itemTitle: item.title, itemPath: item.playPath };
  const open = blocks.findIndex((block) => block.type === type && !pinnedItem(block));
  if (open !== -1) return updateBlock(blocks, open, pin);
  return [...blocks, { type, ...pin, ...goalFor(type), durationMinutes: PINNED_BLOCK_MINUTES }];
}

export function unpinBlock(blocks: readonly RoutineBlock[], index: number): RoutineBlock[] {
  return blocks.map((block, position) => (position === index ? { type: block.type, itemId: "", goal: block.goal, goalValue: block.goalValue, durationMinutes: block.durationMinutes } : block));
}

export function ownCopyName(routine: Routine): string {
  if (routine.origin !== "padrao") return routine.name;
  return `Minha ${routine.name.charAt(0).toLowerCase()}${routine.name.slice(1)}`;
}

export async function addItemToRoutine(routine: Routine, item: RoutineItem, type: BlockKind, now = Date.now()): Promise<number> {
  const blocks = withPinnedItem(routine.blocks, item, type);
  const record = { name: ownCopyName(routine), durationMinutes: totalMinutes(blocks), blocks };
  if (routine.origin !== "padrao" && routine.id !== undefined) {
    await db.routines.update(routine.id, record);
    return routine.id;
  }
  return (await db.routines.add({ ...record, origin: "propria", createdAt: now })) as number;
}

export function goalSummary(block: RoutineBlock): string {
  switch (block.goal) {
    case "repeticoes-limpas":
      return `${block.goalValue} limpas seguidas`;
    case "estrelas":
      return `${block.goalValue} ${block.goalValue === 1 ? "estrela" : "estrelas"}`;
    case "tempo":
      return `${block.durationMinutes} min`;
    case "uma-vez":
      return "uma vez";
  }
}
