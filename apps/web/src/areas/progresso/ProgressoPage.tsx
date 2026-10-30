import { useLiveQuery } from "dexie-react-hooks";
import { Link, useSearchParams } from "react-router";

import { useCore } from "@/core/useCore";
import { bestResultsByExercise, currentStreak, db, DEFAULT_USER_STATS, localDayKey } from "@/data/db";
import { levelForXp } from "@/data/gamification";
import { medalProgress, medalsEarnedCount, rankOf, rankSentence } from "@/data/medals";
import { VoceTabs } from "@/areas/voce/VoceTabs";
import { Card, EmptyState, PageHeader, ProgressRing } from "@/design/components";
import { Skeleton, Stat, Stats, Tabs } from "@/design/layout";

import { Conquistas } from "./Conquistas";
import { Gravacoes } from "./Gravacoes";
import { Heatmap } from "./Heatmap";
import { HistoricoPrecisao } from "./HistoricoPrecisao";
import { Medalhas } from "./Medalhas";

type View = "geral" | "conquistas" | "gravacoes";

const VIEWS: { key: View; label: string }[] = [
  { key: "geral", label: "VisÃ£o geral" },
  { key: "conquistas", label: "Conquistas e medalhas" },
  { key: "gravacoes", label: "GravaÃ§Ãµes" },
];

function viewOf(value: string | null): View {
  return VIEWS.some((view) => view.key === value) ? (value as View) : "geral";
}

export function ProgressoPage() {
  const core = useCore();
  const [params] = useSearchParams();
  const view = viewOf(params.get("ver"));
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
  const rank = rankOf(medalsEarnedCount(medals));
  const exercises = core.status === "ready" ? core.core.exercises : [];

  if (results.length === 0) {
    return (
      <>
        <PageHeader title="VocÃª" />
        <VoceTabs />
        <EmptyState title="Ainda sem registros." description="Toque um exercÃ­cio e o resultado aparece aqui: XP, sequÃªncia, calendÃ¡rio e estrelas por mÃ³dulo." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="VocÃª" />
      <VoceTabs />
      <Card tone="hero" className="mb-8 grid gap-6 md:grid-cols-[auto_1fr] md:items-center md:gap-10">
        <div className="flex items-center gap-5">
          <ProgressRing value={level.intoLevel} max={level.needed} caption={`de ${level.needed} XP`} size={112} />
          <div className="grid gap-1">
            <span className="text-small text-ink-muted">NÃ­vel</span>
            <span className="font-display text-display leading-none">{level.level}</span>
            <span className="text-small text-ink-subtle tabular">{stats.xp} XP no total</span>
          </div>
        </div>
        <Stats label="Resumo da prÃ¡tica" className="min-w-0">
          <Stat value={streak} label={streak === 1 ? "dia seguido" : "dias seguidos"} tone="primary" />
          <Stat value={totalMinutes} label="minutos no total" />
          <Stat value={results.length} label="execuÃ§Ãµes" />
        </Stats>
        <Link to="/voce?ver=conquistas" className="grid gap-0.5 rounded-md bg-primary-soft px-4 py-3 transition-colors duration-fast ease-spalla hover:bg-surface-soft md:col-span-2" aria-label={`Patente ${rank.current.title}. ${rankSentence(rank)} Ver medalhas`}>
          <span className="text-caption text-ink-muted">Patente na orquestra</span>
          <span className="font-semibold text-ink">{rank.current.title}</span>
          <span className="text-small text-primary">{rankSentence(rank)}</span>
        </Link>
      </Card>

      <Tabs label="SeÃ§Ãµes do progresso" items={VIEWS.map((item) => ({ to: item.key === "geral" ? "/voce" : `/voce?ver=${item.key}`, label: item.label, active: item.key === view, ...(item.key === "gravacoes" ? { count: recordings.length } : {}) }))} />

      {view === "geral" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <Heatmap days={days} today={today} />
          </div>
          <Card title="Estrelas por mÃ³dulo" className="grid min-w-0 content-start gap-3 lg:row-span-2">
            {core.status === "ready" ? (
              <ul className="grid gap-3">
                {core.core.curriculum.map((module) => {
                  const playable = module.exercises.filter((exercise) => exercise.playable);
                  const stars = playable.reduce((sum, exercise) => sum + (best.get(exercise.id)?.stars ?? 0), 0);
                  const max = playable.length * 3;
                  return (
                    <li key={module.id}>
                      <Link to={`/estudar/modulo/${module.id}`} className="group grid gap-1 rounded-sm">
                        <div className="flex justify-between gap-4">
                          <span className="font-medium group-hover:text-primary">{module.title}</span>
                          <span className="font-mono text-caption text-ink-subtle tabular">
                            {stars}/{max}
                          </span>
                        </div>
                        <div className="h-2 rounded-pill bg-surface-sunken">
                          <div className="h-full rounded-pill bg-primary" style={{ width: `${max > 0 ? (stars / max) * 100 : 0}%` }} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="grid gap-3" aria-label="Carregando o mÃ©todo">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            )}
          </Card>
          <div className="min-w-0 lg:col-span-2">
            <HistoricoPrecisao results={results} exercises={exercises} />
          </div>
        </div>
      ) : null}

      {view === "conquistas" ? (
        <div className="grid gap-6">
          <Medalhas medals={medals} />
          <Conquistas unlocked={achievements} />
        </div>
      ) : null}

      {view === "gravacoes" ? (
        recordings.length > 0 ? (
          <Gravacoes recordings={recordings} />
        ) : (
          <EmptyState title="Nenhuma gravaÃ§Ã£o ainda." description="Grave um trecho no Gravador para ouvir como vocÃª estÃ¡ tocando e comparar com o tempo." />
        )
      ) : null}
    </>
  );
}
