import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router";

import { useCore } from "@/core/useCore";
import { bestResultsByExercise, currentStreak, db, localDayKey } from "@/data/db";
import { Card, EmptyState, InlineError, PageTitle, ProgressRing, Stars } from "@/design/components";

const DAILY_GOAL_MINUTES = 20;

function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function HojePage() {
  const core = useCore();
  const today = localDayKey(new Date());
  const days = useLiveQuery(() => db.practiceDays.toArray(), []) ?? [];
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];
  const todayMinutes = Math.round(days.find((day) => day.day === today)?.minutes ?? 0);
  const streak = currentStreak(days, today);
  const best = bestResultsByExercise(results);

  const suggestion =
    core.status === "ready" ? core.core.exercises.find((exercise) => exercise.playable && (best.get(exercise.id)?.stars ?? 0) < 3) : undefined;

  return (
    <>
      <PageTitle eyebrow={greeting(new Date().getHours())} title="Sua prática de hoje">
        {suggestion ? (
          <Link
            to={`/tocar/${suggestion.id}`}
            className="hidden h-10 items-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover md:inline-flex"
          >
            Começar
          </Link>
        ) : null}
      </PageTitle>

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <Card className="flex flex-col items-center gap-4 md:w-64">
          <ProgressRing value={todayMinutes} max={DAILY_GOAL_MINUTES} caption={`de ${DAILY_GOAL_MINUTES} min`} />
          <p className="text-center text-body text-ink-muted">
            {streak > 0 ? `${streak} ${streak === 1 ? "dia seguido" : "dias seguidos"} praticando.` : "Toque hoje para começar uma sequência."}
          </p>
        </Card>

        <Card title="Próximo passo">
          {core.status === "loading" ? <p className="text-ink-muted">Carregando exercícios…</p> : null}
          {core.status === "error" ? <InlineError title="Os exercícios não carregaram." nextStep={core.message} /> : null}
          {core.status === "ready" && suggestion ? (
            <div className="grid gap-4">
              <div>
                <h3 className="text-heading font-semibold">{suggestion.title}</h3>
                <p className="text-ink-muted">{suggestion.subtitle}</p>
              </div>
              <p className="max-w-prose text-body">{suggestion.howTo}</p>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to={`/tocar/${suggestion.id}`}
                  className="inline-flex h-11 items-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover md:h-10"
                >
                  Tocar agora
                </Link>
                <Stars count={best.get(suggestion.id)?.stars ?? 0} label={`${suggestion.defaultBpm} bpm`} />
              </div>
            </div>
          ) : null}
          {core.status === "ready" && !suggestion ? (
            <EmptyState
              title="Tudo com três estrelas."
              description="Você fechou todos os exercícios. Importe uma música nova ou revise um módulo."
              action={
                <Link to="/musicas" className="font-semibold text-primary">
                  Ir para Músicas
                </Link>
              }
            />
          ) : null}
        </Card>
      </div>
    </>
  );
}
