import { useLiveQuery } from "dexie-react-hooks";

import { useCore } from "@/core/useCore";
import { bestResultsByExercise, currentStreak, db, DEFAULT_USER_STATS, localDayKey } from "@/data/db";
import { levelForXp } from "@/data/gamification";
import { medalProgress } from "@/data/medals";
import { Card, EmptyState, PageTitle, ProgressRing } from "@/design/components";

import { Conquistas } from "./Conquistas";
import { Gravacoes } from "./Gravacoes";
import { Heatmap } from "./Heatmap";
import { HistoricoPrecisao } from "./HistoricoPrecisao";
import { Medalhas } from "./Medalhas";

export function ProgressoPage() {
  const core = useCore();
  const days = useLiveQuery(() => db.practiceDays.toArray(), []) ?? [];
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];
  const achievements = useLiveQuery(() => db.achievements.toArray(), []) ?? [];
  const recordings = useLiveQuery(() => db.recordings.toArray(), []) ?? [];
  const stats = useLiveQuery(() => db.userStats.get("me"), []) ?? DEFAULT_USER_STATS;
  const today = new Date();
  const streak = currentStreak(days, localDayKey(today), stats.frozenDays);
  const best = bestResultsByExercise(results);
  const level = levelForXp(stats.xp);
  const totalMinutes = Math.round(days.reduce((sum, day) => sum + day.minutes, 0));
  const medals = medalProgress({ results, days, frozenDays: stats.frozenDays });
  const exercises = core.status === "ready" ? core.core.exercises : [];

  if (results.length === 0) {
    return (
      <>
        <PageTitle title="Progresso" />
        <EmptyState title="Ainda sem registros." description="Toque um exercício e o resultado aparece aqui: XP, sequência, calendário e estrelas por módulo." />
      </>
    );
  }

  return (
    <>
      <PageTitle title="Progresso" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex items-center gap-5">
          <ProgressRing value={level.intoLevel} max={level.needed} caption={`de ${level.needed} XP`} size={104} />
          <div className="grid gap-1">
            <span className="text-caption text-ink-subtle">Nível</span>
            <span className="font-display text-title">{level.level}</span>
            <span className="text-caption text-ink-subtle">{stats.xp} XP no total</span>
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
        <Card title="Estrelas por módulo" className="grid content-start gap-3">
          {core.status === "ready" ? (
            <ul className="grid gap-3">
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
          ) : (
            <p className="text-ink-muted">Carregando o método…</p>
          )}
        </Card>

        <div className="lg:col-span-2">
          <Heatmap days={days} today={today} />
        </div>
        <HistoricoPrecisao results={results} exercises={exercises} />
        <div className="lg:col-span-2">
          <Conquistas unlocked={achievements} />
        </div>
        <div className="lg:col-span-3">
          <Medalhas medals={medals} />
        </div>
        {recordings.length > 0 ? (
          <div className="lg:col-span-3">
            <Gravacoes recordings={recordings} />
          </div>
        ) : null}
      </div>
    </>
  );
}
