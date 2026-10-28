import type { ExerciseKind } from "@fretless/core";

import type { BlockKind, Routine, RoutineBlock } from "./db";

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

export function blocksFromMinutes(minutes: RoutineMinutes): RoutineBlock[] {
  return ROUTINE_ORDER.flatMap((type) => {
    const durationMinutes = minutes[type] ?? 0;
    if (durationMinutes <= 0) return [];
    return [{ type, itemId: "", goal: "uma-vez" as const, goalValue: 1, durationMinutes }];
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
