import { dayBefore, type ExerciseResult, type PracticeDay } from "./db";
import { CLEAN_RUN_ACCURACY_PCT } from "./repetitions";

export type MedalTier = 0 | 1 | 2 | 3;

export const TIER_NAMES: Record<Exclude<MedalTier, 0>, string> = { 1: "Bronze", 2: "Prata", 3: "Ouro" };

const FULL_WEEK_DAYS = 5;
const LONG_DAY_MINUTES = 30;
const EARLY_HOUR_START = 4;
const EARLY_HOUR_END = 9;
const FINE_TUNING_CENTS = 5;
const FINE_TUNING_MIN_ACCURACY = 80;
const COMEBACK_START_PCT = 70;
const SCALE_PREFIX = "scales.";

export type MedalId =
  | "execucoes"
  | "dias"
  | "sequencia"
  | "tres-estrelas"
  | "limpas"
  | "minutos"
  | "musicas"
  | "afinacao-fina"
  | "escalas"
  | "explorador"
  | "volta-por-cima"
  | "folego"
  | "semana-cheia"
  | "cotovia";

export type MedalGroup = "constancia" | "tecnica" | "repertorio";

export interface MedalGroupInfo {
  id: MedalGroup;
  title: string;
  description: string;
}

export const MEDAL_GROUPS: readonly MedalGroupInfo[] = [
  { id: "constancia", title: "Constância", description: "Aparecer todo dia vale mais do que uma maratona por mês." },
  { id: "tecnica", title: "Técnica e afinação", description: "Notas limpas, afinadas e as escalas que sustentam tudo." },
  { id: "repertorio", title: "Repertório e coragem", description: "Músicas novas, exercícios novos e não desistir do que é difícil." },
];

export interface MedalDefinition {
  id: MedalId;
  group: MedalGroup;
  name: string;
  description: string;
  unit: [singular: string, plural: string];
  thresholds: readonly [bronze: number, silver: number, gold: number];
}

export const MEDALS: readonly MedalDefinition[] = [
  { id: "dias", group: "constancia", name: "Presença", description: "Dias em que você abriu o violino e tocou.", unit: ["dia", "dias"], thresholds: [7, 30, 100] },
  { id: "sequencia", group: "constancia", name: "Constância", description: "Maior sequência de dias seguidos praticando.", unit: ["dia seguido", "dias seguidos"], thresholds: [7, 30, 100] },
  { id: "semana-cheia", group: "constancia", name: "Semana cheia", description: `Semanas com ${FULL_WEEK_DAYS} dias ou mais de prática.`, unit: ["semana", "semanas"], thresholds: [1, 8, 26] },
  { id: "minutos", group: "constancia", name: "Horas de arco", description: "Minutos de prática somados.", unit: ["minuto", "minutos"], thresholds: [60, 600, 6000] },
  { id: "folego", group: "constancia", name: "Fôlego", description: `Dias com ${LONG_DAY_MINUTES} minutos ou mais de prática.`, unit: ["dia longo", "dias longos"], thresholds: [3, 20, 60] },
  { id: "cotovia", group: "constancia", name: "Cotovia", description: `Dias em que você tocou antes das ${EARLY_HOUR_END}h.`, unit: ["manhã", "manhãs"], thresholds: [3, 15, 50] },
  { id: "execucoes", group: "tecnica", name: "Arco em movimento", description: "Execuções registradas, de qualquer exercício.", unit: ["execução", "execuções"], thresholds: [10, 100, 500] },
  { id: "limpas", group: "tecnica", name: "Mão firme", description: `Execuções com ${CLEAN_RUN_ACCURACY_PCT}% ou mais de notas afinadas.`, unit: ["execução limpa", "execuções limpas"], thresholds: [10, 100, 500] },
  { id: "afinacao-fina", group: "tecnica", name: "Ouvido fino", description: `Execuções com desvio médio de até ${FINE_TUNING_CENTS} cents e ${FINE_TUNING_MIN_ACCURACY}% de acerto.`, unit: ["execução afinada", "execuções afinadas"], thresholds: [5, 50, 250] },
  { id: "escalas", group: "tecnica", name: "Escada", description: "Escalas e arpejos diferentes que você já tocou.", unit: ["escala", "escalas"], thresholds: [3, 12, 36] },
  { id: "tres-estrelas", group: "tecnica", name: "Céu limpo", description: "Exercícios diferentes com três estrelas.", unit: ["exercício", "exercícios"], thresholds: [5, 25, 100] },
  { id: "musicas", group: "repertorio", name: "Repertório", description: "Músicas diferentes, importadas ou da biblioteca, tocadas até o fim.", unit: ["música", "músicas"], thresholds: [1, 5, 20] },
  { id: "explorador", group: "repertorio", name: "Explorador", description: "Exercícios e músicas diferentes que você já experimentou.", unit: ["item", "itens"], thresholds: [10, 50, 150] },
  { id: "volta-por-cima", group: "repertorio", name: "Volta por cima", description: `Começou abaixo de ${COMEBACK_START_PCT}% e chegou às três estrelas.`, unit: ["virada", "viradas"], thresholds: [1, 5, 20] },
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

export const PIECE_RESULT_PREFIXES = ["musica:", "biblioteca:"] as const;

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

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function nextDay(day: string): string {
  return shiftDay(day, 1);
}

function isPieceResult(exerciseId: string): boolean {
  return PIECE_RESULT_PREFIXES.some((prefix) => exerciseId.startsWith(prefix));
}

function distinctIds(results: readonly ExerciseResult[]): number {
  return new Set(results.map((result) => result.exerciseId)).size;
}

export function comebacks(results: readonly ExerciseResult[]): number {
  const firstRun = new Map<string, ExerciseResult>();
  const reachedThree = new Set<string>();
  for (const result of results) {
    const first = firstRun.get(result.exerciseId);
    if (!first || result.playedAt < first.playedAt) firstRun.set(result.exerciseId, result);
    if (result.stars === 3) reachedThree.add(result.exerciseId);
  }
  return [...firstRun.values()].filter((first) => first.accuracyPct < COMEBACK_START_PCT && reachedThree.has(first.exerciseId)).length;
}

function mondayOf(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

export function fullWeeks(days: readonly PracticeDay[]): number {
  const perWeek = new Map<string, number>();
  for (const day of new Set(days.filter((item) => item.minutes > 0).map((item) => item.day))) {
    const week = mondayOf(day);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }
  return [...perWeek.values()].filter((count) => count >= FULL_WEEK_DAYS).length;
}

export function earlyDays(results: readonly ExerciseResult[]): number {
  const early = results.filter((result) => {
    const hour = new Date(result.playedAt).getHours();
    return hour >= EARLY_HOUR_START && hour < EARLY_HOUR_END;
  });
  return new Set(early.map((result) => new Date(result.playedAt).toDateString())).size;
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
      return distinctIds(input.results.filter((result) => result.stars === 3));
    case "limpas":
      return input.results.filter((result) => result.accuracyPct >= CLEAN_RUN_ACCURACY_PCT).length;
    case "minutos":
      return Math.floor(input.days.reduce((sum, day) => sum + day.minutes, 0));
    case "musicas":
      return distinctIds(input.results.filter((result) => isPieceResult(result.exerciseId)));
    case "afinacao-fina":
      return input.results.filter((result) => Math.abs(result.meanSignedCents) <= FINE_TUNING_CENTS && result.accuracyPct >= FINE_TUNING_MIN_ACCURACY).length;
    case "escalas":
      return distinctIds(input.results.filter((result) => result.exerciseId.startsWith(SCALE_PREFIX)));
    case "explorador":
      return distinctIds(input.results);
    case "volta-por-cima":
      return comebacks(input.results);
    case "folego":
      return input.days.filter((day) => day.minutes >= LONG_DAY_MINUTES).length;
    case "semana-cheia":
      return fullWeeks(input.days);
    case "cotovia":
      return earlyDays(input.results);
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

export function medalShare(progress: MedalProgress): number {
  if (progress.nextThreshold === null) return 1;
  const floor = progress.tier === 0 ? 0 : progress.definition.thresholds[progress.tier - 1]!;
  return Math.min(1, Math.max(0, (progress.count - floor) / (progress.nextThreshold - floor)));
}

export function nearestMedals(progress: readonly MedalProgress[], limit = 3): MedalProgress[] {
  return progress
    .filter((medal) => medal.nextThreshold !== null)
    .sort((a, b) => medalShare(b) - medalShare(a) || a.definition.thresholds[0] - b.definition.thresholds[0])
    .slice(0, limit);
}

export function missingSentence(progress: MedalProgress): string {
  if (progress.nextThreshold === null) return `${progress.definition.name}: ouro conquistado.`;
  const missing = progress.nextThreshold - progress.count;
  const unit = missing === 1 ? progress.definition.unit[0] : progress.definition.unit[1];
  const nextTier = TIER_NAMES[(progress.tier + 1) as Exclude<MedalTier, 0>].toLowerCase();
  return `${missing === 1 ? "Falta" : "Faltam"} ${missing} ${unit} para ${progress.definition.name} de ${nextTier}.`;
}

export interface Rank {
  title: string;
  description: string;
  minTiers: number;
}

export const RANKS: readonly Rank[] = [
  { title: "Primeiro arco", description: "Todo spalla começou tirando o violino do estojo.", minTiers: 0 },
  { title: "Aprendiz de estante", description: "Já tem rotina e sabe onde mora cada nota.", minTiers: 3 },
  { title: "Músico de fila", description: "Toca junto, segura o andamento e não foge da escala.", minTiers: 9 },
  { title: "Chefe de naipe", description: "Os outros violinos olham para você na entrada.", minTiers: 18 },
  { title: "Spalla", description: "Afina a orquestra e conduz os colegas.", minTiers: 28 },
  { title: "Solista", description: "Quase todas as medalhas no peito. O palco é seu.", minTiers: 38 },
];

export interface RankProgress {
  current: Rank;
  next: Rank | null;
  tiers: number;
  missing: number;
}

export function rankOf(tiers: number): RankProgress {
  const reached = RANKS.filter((rank) => tiers >= rank.minTiers);
  const current = reached[reached.length - 1] ?? RANKS[0]!;
  const next = RANKS[reached.length] ?? null;
  return { current, next, tiers, missing: next ? next.minTiers - tiers : 0 };
}

export function rankSentence(rank: RankProgress): string {
  if (!rank.next) return `${rank.current.title}: o topo da orquestra.`;
  const word = rank.missing === 1 ? "medalha" : "medalhas";
  return `${rank.missing === 1 ? "Falta" : "Faltam"} ${rank.missing} ${word} para ${rank.next.title}.`;
}
