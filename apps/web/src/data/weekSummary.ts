import { dayBefore, localDayKey, type ExerciseResult, type LessonTask, type PracticeDay } from "./db";

const DAYS_IN_WEEK = 7;
const DRIFT_THRESHOLD_CENTS = 5;

export interface WeekWindow {
  from: string;
  to: string;
  dayCount: number;
}

export interface WeekSummary extends WeekWindow {
  minutes: number;
  daysPracticed: number;
  runs: number;
  exercisesPlayed: number;
  tasksDone: number;
  tasksOpen: number;
  weakest: { exerciseId: string; accuracyPct: number } | null;
  drift: "baixo" | "alto" | null;
}

export function weekWindow(lessonWeekday: number | null, today: Date): WeekWindow {
  const to = localDayKey(today);
  const sinceLesson = lessonWeekday === null ? 0 : (today.getDay() - lessonWeekday + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const dayCount = sinceLesson === 0 ? DAYS_IN_WEEK : sinceLesson;
  const from = Array.from({ length: dayCount - 1 }).reduce<string>((day) => dayBefore(day), to);
  return { from, to, dayCount };
}

function isInWindow(day: string, window: WeekWindow): boolean {
  return day >= window.from && day <= window.to;
}

function weakestOf(results: readonly ExerciseResult[]): WeekSummary["weakest"] {
  const byExercise = new Map<string, number[]>();
  for (const result of results) byExercise.set(result.exerciseId, [...(byExercise.get(result.exerciseId) ?? []), result.accuracyPct]);
  const averages = [...byExercise].map(([exerciseId, accuracies]) => ({ exerciseId, accuracyPct: Math.round(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length) }));
  return averages.reduce<WeekSummary["weakest"]>((weakest, item) => (weakest === null || item.accuracyPct < weakest.accuracyPct ? item : weakest), null);
}

function driftOf(results: readonly ExerciseResult[]): WeekSummary["drift"] {
  if (results.length === 0) return null;
  const mean = results.reduce((sum, result) => sum + result.meanSignedCents, 0) / results.length;
  if (mean <= -DRIFT_THRESHOLD_CENTS) return "baixo";
  if (mean >= DRIFT_THRESHOLD_CENTS) return "alto";
  return null;
}

export function weekSummary(input: { window: WeekWindow; days: readonly PracticeDay[]; results: readonly ExerciseResult[]; tasks: readonly LessonTask[] }): WeekSummary {
  const { window, tasks } = input;
  const days = input.days.filter((day) => isInWindow(day.day, window) && day.minutes > 0);
  const results = input.results.filter((result) => isInWindow(localDayKey(new Date(result.playedAt)), window));
  return {
    ...window,
    minutes: Math.round(days.reduce((sum, day) => sum + day.minutes, 0)),
    daysPracticed: days.length,
    runs: results.length,
    exercisesPlayed: new Set(results.map((result) => result.exerciseId)).size,
    tasksDone: tasks.filter((task) => task.doneAt !== null && isInWindow(localDayKey(new Date(task.doneAt)), window)).length,
    tasksOpen: tasks.filter((task) => task.doneAt === null).length,
    weakest: weakestOf(results),
    drift: driftOf(results),
  };
}

export function formatDay(day: string): string {
  const [, month, dayOfMonth] = day.split("-");
  return `${dayOfMonth}/${month}`;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function weekSummaryLines(summary: WeekSummary, titleOf: (exerciseId: string) => string | null): string[] {
  const period = summary.dayCount === 1 ? `Hoje, ${formatDay(summary.to)}` : `De ${formatDay(summary.from)} a ${formatDay(summary.to)}`;
  if (summary.runs === 0) return [period, "Nenhum exercício tocado neste período."];
  const lines = [
    period,
    `Praticou ${summary.daysPracticed} de ${plural(summary.dayCount, "dia", "dias")}, ${plural(summary.minutes, "minuto", "minutos")} no total.`,
    `${plural(summary.runs, "execução", "execuções")} de ${plural(summary.exercisesPlayed, "exercício", "exercícios")}.`,
  ];
  if (summary.tasksDone > 0 || summary.tasksOpen > 0) {
    lines.push(`Tarefas da aula: ${plural(summary.tasksDone, "feita", "feitas")}, ${plural(summary.tasksOpen, "aberta", "abertas")}.`);
  }
  if (summary.weakest) {
    const title = titleOf(summary.weakest.exerciseId) ?? summary.weakest.exerciseId;
    lines.push(`Onde errou mais: ${title} (${summary.weakest.accuracyPct}% de afinação).`);
  }
  if (summary.drift === "baixo") lines.push("Tendência: as notas saem baixas.");
  if (summary.drift === "alto") lines.push("Tendência: as notas saem altas.");
  return lines;
}
