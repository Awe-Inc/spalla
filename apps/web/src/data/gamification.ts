import type { GameStats, NoteJudgement } from "@fretless/core";

import type { ExerciseResult, UserStats } from "./db";

export const XP_PERFECT = 3;
export const XP_GREAT = 1;
export const COMBO_MULTIPLIER_AT = 20;
export const COMBO_MULTIPLIER = 2;
export const SESSION_COMPLETE_XP = 50;
export const FREEZER_COST_RESINAS = 100;

export function xpForRun(judgements: readonly NoteJudgement[]): number {
  let perfectStreak = 0;
  return judgements.reduce((xp, judgement) => {
    perfectStreak = judgement.grade === "Perfect" ? perfectStreak + 1 : 0;
    const multiplier = perfectStreak > COMBO_MULTIPLIER_AT ? COMBO_MULTIPLIER : 1;
    if (judgement.grade === "Perfect") return xp + XP_PERFECT * multiplier;
    if (judgement.grade === "Great") return xp + XP_GREAT;
    return xp;
  }, 0);
}

export function perfectStreakActive(judgements: readonly NoteJudgement[]): number {
  let streak = 0;
  for (const judgement of judgements) streak = judgement.grade === "Perfect" ? streak + 1 : 0;
  return streak;
}

export const MASTERY_LEVELS = [
  { level: 1, name: "Leitura", hint: "Tocou inteira pelo menos uma vez." },
  { level: 2, name: "Afinação", hint: "80% das notas afinadas, em qualquer andamento." },
  { level: 3, name: "Andamento", hint: "90% afinadas no andamento escrito." },
  { level: 4, name: "Pedal", hint: "90% afinadas com a nota pedal ligada." },
  { level: 5, name: "Memória", hint: "90% afinadas de cor, sem a pauta." },
] as const;

export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;

export function masteryOfRun(result: Pick<ExerciseResult, "accuracyPct" | "bpm" | "withDrone" | "fromMemory">, writtenBpm: number): MasteryLevel {
  const clean = result.accuracyPct >= 90;
  if (clean && result.fromMemory && result.bpm >= writtenBpm) return 5;
  if (clean && result.withDrone) return 4;
  if (clean && result.bpm >= writtenBpm) return 3;
  if (result.accuracyPct >= 80) return 2;
  if (result.accuracyPct >= 60) return 1;
  return 0;
}

export function masteryOfExercise(results: readonly ExerciseResult[]): MasteryLevel {
  return results.reduce<MasteryLevel>((best, result) => {
    const level = (result.masteryLevel ?? 0) as MasteryLevel;
    return level > best ? level : best;
  }, 0);
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: "afinador-humano", name: "Afinador Humano", description: "30 notas perfeitas seguidas numa execução." },
  { id: "o-metodico", name: "O Metódico", description: "7 dias seguidos batendo a meta." },
  { id: "coruja-musical", name: "Coruja Musical", description: "Uma execução depois das 22h." },
  { id: "violino-de-fogo", name: "Violino de Fogo", description: "30 dias seguidos batendo a meta." },
  { id: "desconstrucao", name: "Desconstrução", description: "Repetiu um trecho difícil até fechar o loop." },
];

export interface AchievementContext {
  stats: GameStats;
  judgements: readonly NoteJudgement[];
  playedAt: Date;
  streak: number;
  loopsCompleted: number;
}

export function achievementsEarned(context: AchievementContext, already: ReadonlySet<string>): string[] {
  const earned: string[] = [];
  const consider = (id: string, met: boolean) => {
    if (met && !already.has(id)) earned.push(id);
  };
  consider("afinador-humano", longestPerfectStreak(context.judgements) >= 30);
  consider("o-metodico", context.streak >= 7);
  consider("coruja-musical", context.playedAt.getHours() >= 22);
  consider("violino-de-fogo", context.streak >= 30);
  consider("desconstrucao", context.loopsCompleted >= 1);
  return earned;
}

export function longestPerfectStreak(judgements: readonly NoteJudgement[]): number {
  let longest = 0;
  let current = 0;
  for (const judgement of judgements) {
    current = judgement.grade === "Perfect" ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  priceResinas: number;
  kind: "sound" | "theme" | "freezer";
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: "freezer", name: "Congelador de ofensiva", description: "Protege a sequência por um dia sem praticar.", priceResinas: FREEZER_COST_RESINAS, kind: "freezer" },
  { id: "sound:digital", name: "Clique digital", description: "Som de metrônomo eletrônico, mais seco.", priceResinas: 40, kind: "sound" },
  { id: "sound:suave", name: "Clique suave", description: "Som de metrônomo redondo, para notas longas.", priceResinas: 40, kind: "sound" },
  { id: "theme:sepia", name: "Tema sépia", description: "Tons de papel antigo para o app inteiro.", priceResinas: 80, kind: "theme" },
];

export function canBuy(stats: UserStats, item: ShopItem): boolean {
  if (stats.resinas < item.priceResinas) return false;
  return item.kind === "freezer" || !stats.unlockedItems.includes(item.id);
}

export function levelForXp(xp: number): { level: number; intoLevel: number; needed: number } {
  let level = 1;
  let needed = 100;
  let remaining = xp;
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = Math.round(needed * 1.25);
  }
  return { level, intoLevel: remaining, needed };
}
