import { dayBefore, type ExerciseResult, type PracticeDay } from "./db";
import { CLEAN_RUN_ACCURACY_PCT } from "./repetitions";

export type MedalTier = 0 | 1 | 2 | 3;

export const TIER_NAMES: Record<Exclude<MedalTier, 0>, string> = { 1: "Bronze", 2: "Prata", 3: "Ouro" };

export type MedalId = "execucoes" | "dias" | "sequencia" | "tres-estrelas" | "limpas" | "minutos" | "musicas";

export interface MedalDefinition {
  id: MedalId;
  name: string;
  description: string;
  unit: [singular: string, plural: string];
  thresholds: readonly [bronze: number, silver: number, gold: number];
}

export const MEDALS: readonly MedalDefinition[] = [
  { id: "execucoes", name: "Arco em movimento", description: "Execuções registradas, de qualquer exercício.", unit: ["execução", "execuções"], thresholds: [10, 100, 500] },
  { id: "dias", name: "Presença", description: "Dias em que você abriu o violino e tocou.", unit: ["dia", "dias"], thresholds: [7, 30, 100] },
  { id: "sequencia", name: "Constância", description: "Maior sequência de dias seguidos praticando.", unit: ["dia seguido", "dias seguidos"], thresholds: [7, 30, 100] },
  { id: "tres-estrelas", name: "Céu limpo", description: "Exercícios diferentes com três estrelas.", unit: ["exercício", "exercícios"], thresholds: [5, 25, 100] },
  { id: "limpas", name: "Mão firme", description: `Execuções com ${CLEAN_RUN_ACCURACY_PCT}% ou mais de notas afinadas.`, unit: ["execução limpa", "execuções limpas"], thresholds: [10, 100, 500] },
  { id: "minutos", name: "Horas de arco", description: "Minutos de prática somados.", unit: ["minuto", "minutos"], thresholds: [60, 600, 6000] },
  { id: "musicas", name: "Repertório", description: "Músicas diferentes tocadas até o fim.", unit: ["música", "músicas"], thresholds: [1, 5, 20] },
];

export interface MedalProgress {
  definition: MedalDefinition;
  count: number;
  tier: MedalTier;
  nextThreshold: number | null;
}

export interface MedalInput {
  results: readonly ExerciseResult[];
  days: readonly PracticeDay[];
  frozenDays?: readonly string[];
}

export const PIECE_RESULT_PREFIX = "musica:";

export function tierOf(count: number, thresholds: MedalDefinition["thresholds"]): MedalTier {
  return thresholds.filter((threshold) => count >= threshold).length as MedalTier;
}

export function longestStreak(days: readonly PracticeDay[], frozenDays: readonly string[] = []): number {
  const practised = new Set(days.filter((day) => day.minutes > 0).map((day) => day.day));
  const frozen = new Set(frozenDays);
  const starts = [...practised].filter((day) => !practised.has(dayBefore(day)) && !frozen.has(dayBefore(day)));
  return starts.reduce((longest, start) => {
    let streak = 0;
    let cursor = start;
    while (practised.has(cursor) || frozen.has(cursor)) {
      if (practised.has(cursor)) streak += 1;
      cursor = nextDay(cursor);
    }
    return Math.max(longest, streak);
  }, 0);
}

function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function countFor(id: MedalId, input: MedalInput): number {
  switch (id) {
    case "execucoes":
      return input.results.length;
    case "dias":
      return input.days.filter((day) => day.minutes > 0).length;
    case "sequencia":
      return longestStreak(input.days, input.frozenDays);
    case "tres-estrelas":
      return new Set(input.results.filter((result) => result.stars === 3).map((result) => result.exerciseId)).size;
    case "limpas":
      return input.results.filter((result) => result.accuracyPct >= CLEAN_RUN_ACCURACY_PCT).length;
    case "minutos":
      return Math.floor(input.days.reduce((sum, day) => sum + day.minutes, 0));
    case "musicas":
      return new Set(input.results.filter((result) => result.exerciseId.startsWith(PIECE_RESULT_PREFIX)).map((result) => result.exerciseId)).size;
  }
}

export function medalProgress(input: MedalInput): MedalProgress[] {
  return MEDALS.map((definition) => {
    const count = countFor(definition.id, input);
    const tier = tierOf(count, definition.thresholds);
    return { definition, count, tier, nextThreshold: tier === 3 ? null : definition.thresholds[tier] };
  });
}

export interface EarnedMedal {
  id: MedalId;
  tier: Exclude<MedalTier, 0>;
}

export function newMedals(before: readonly MedalProgress[], after: readonly MedalProgress[]): EarnedMedal[] {
  const previous = new Map(before.map((medal) => [medal.definition.id, medal.tier]));
  return after.filter((medal) => medal.tier > (previous.get(medal.definition.id) ?? 0)).map((medal) => ({ id: medal.definition.id, tier: medal.tier as Exclude<MedalTier, 0> }));
}

export function earnedMedalTitle(medal: EarnedMedal): string {
  const definition = MEDALS.find((item) => item.id === medal.id);
  return `${definition?.name ?? medal.id} de ${TIER_NAMES[medal.tier].toLowerCase()}`;
}

export function medalSentence(progress: MedalProgress): string {
  const unit = progress.count === 1 ? progress.definition.unit[0] : progress.definition.unit[1];
  if (progress.nextThreshold === null) return `${progress.count} ${unit}. Ouro: não tem mais o que provar.`;
  const nextTier = TIER_NAMES[(progress.tier + 1) as Exclude<MedalTier, 0>].toLowerCase();
  const article = progress.tier + 1 === 2 ? "a" : "o";
  return `${progress.count} de ${progress.nextThreshold} ${progress.definition.unit[1]} para ${article} ${nextTier}.`;
}

export function medalsEarnedCount(progress: readonly MedalProgress[]): number {
  return progress.reduce((sum, medal) => sum + medal.tier, 0);
}

export const MAX_MEDAL_TIERS = MEDALS.length * 3;
