import { useLiveQuery } from "dexie-react-hooks";

import { useCore } from "@/core/useCore";
import { bestResultsByExercise, currentStreak, db, localDayKey } from "@/data/db";
import { Card, EmptyState, PageTitle } from "@/design/components";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

function lastSevenDays(today: Date): Date[] {
  return Array.from({ length: 7 }, (_, offset) => new Date(today.getTime() - (6 - offset) * 86_400_000));
}

export function ProgressoPage() {
  const core = useCore();
  const days = useLiveQuery(() => db.practiceDays.toArray(), []) ?? [];
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];
  const today = new Date();
  const streak = currentStreak(days, localDayKey(today));
  const best = bestResultsByExercise(results);
  const minutesByDay = new Map(days.map((day) => [day.day, day.minutes]));
  const week = lastSevenDays(today).map((date) => ({ date, minutes: minutesByDay.get(localDayKey(date)) ?? 0 }));
  const weekMax = Math.max(1, ...week.map((entry) => entry.minutes));
  const totalMinutes = Math.round(days.reduce((sum, day) => sum + day.minutes, 0));

  if (results.length === 0) {
    return (
      <>
        <PageTitle title="Progresso" />
        <EmptyState title="Ainda sem registros." description="Toque um exercício e o resultado aparece aqui, com estrelas por módulo e minutos por dia." />
      </>
    );
  }

  return (
    <>
      <PageTitle title="Progresso" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Últimos 7 dias" className="lg:col-span-2">
          <div className="flex h-40 items-end gap-3">
            {week.map((entry) => (
              <div key={entry.date.toISOString()} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-caption text-ink-subtle tabular">{Math.round(entry.minutes)}</span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-sm ${entry.minutes > 0 ? "bg-primary" : "bg-surface-sunken"}`}
                    style={{ height: `${Math.max(4, (entry.minutes / weekMax) * 100)}%` }}
                    aria-label={`${Math.round(entry.minutes)} minutos`}
                  />
                </div>
                <span className="text-caption text-ink-subtle">{WEEKDAY_LABELS[entry.date.getDay()]}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Resumo" className="grid content-start gap-3">
          <p>
            <span className="font-mono text-numeric tabular">{streak}</span>
            <span className="ml-2 text-ink-muted">{streak === 1 ? "dia seguido" : "dias seguidos"}</span>
          </p>
          <p>
            <span className="font-mono text-numeric tabular">{totalMinutes}</span>
            <span className="ml-2 text-ink-muted">minutos no total</span>
          </p>
          <p>
            <span className="font-mono text-numeric tabular">{results.length}</span>
            <span className="ml-2 text-ink-muted">execuções</span>
          </p>
        </Card>

        {core.status === "ready" ? (
          <Card title="Estrelas por módulo" className="lg:col-span-3">
            <ul className="grid gap-3 md:grid-cols-3">
              {core.core.curriculum.map((module) => {
                const playable = module.exercises.filter((exercise) => exercise.playable);
                const stars = playable.reduce((sum, exercise) => sum + (best.get(exercise.id)?.stars ?? 0), 0);
                const max = playable.length * 3;
                return (
                  <li key={module.id} className="grid gap-1">
                    <div className="flex justify-between gap-4">
                      <span className="font-medium">{module.title}</span>
                      <span className="font-mono text-caption text-ink-subtle tabular">
                        {stars}/{max}
                      </span>
                    </div>
                    <div className="h-2 rounded-pill bg-surface-sunken">
                      <div className="h-full rounded-pill bg-close" style={{ width: `${max > 0 ? (stars / max) * 100 : 0}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
