import { useEffect } from "react";
import { Link } from "react-router";

import { SESSION_COMPLETE_XP } from "@/data/gamification";
import type { PlannedBlock } from "@/data/planner";
import { grantSessionBonus, useFreezer } from "@/data/progress";
import { BLOCK_LABELS } from "@/data/routines";
import { Button, Card, EmptyState, PageTitle, ProgressRing } from "@/design/components";

import { CadernoDaAula } from "./CadernoDaAula";
import { useTodayPlan } from "./useTodayPlan";

function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function streakSentence(streak: number, frozenToday: boolean): string {
  if (frozenToday) return "Hoje está congelado: a sequência fica guardada.";
  if (streak === 0) return "Bata a meta de hoje para começar uma sequência.";
  return `${streak} ${streak === 1 ? "dia seguido" : "dias seguidos"} batendo a meta.`;
}

function BlockRow({ planned, done, isNext }: { planned: PlannedBlock; done: boolean; isNext: boolean }) {
  const exercise = planned.exercise;
  const toneClass = done ? "text-ink-subtle line-through" : isNext ? "text-ink" : "text-ink-muted";
  return (
    <li className={`grid gap-1 py-3 ${isNext ? "border-l-2 border-primary pl-4" : "pl-4"}`}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-caption text-ink-subtle">
          {BLOCK_LABELS[planned.block.type]} · {planned.block.durationMinutes} min
        </span>
        {planned.fromLesson ? <span className="rounded-pill bg-info-soft px-2 text-caption text-info">Da aula</span> : null}
      </div>
      {exercise ? (
        <Link to={`/tocar/${exercise.id}`} className={`font-medium hover:text-primary ${toneClass}`}>
          {exercise.title}
          {planned.targetBpm ? <span className="ml-2 font-mono text-caption text-primary tabular">→ {planned.targetBpm} bpm</span> : null}
        </Link>
      ) : (
        <span className="text-ink-subtle">{planned.reason}</span>
      )}
      {exercise ? (
        <span className="text-caption text-ink-subtle">
          {planned.reason}
          {planned.variation ? ` · Hoje: ${planned.variation}.` : ""}
        </span>
      ) : null}
    </li>
  );
}

export function HojePage() {
  const today = useTodayPlan();
  const allDone = today.progress.total > 0 && today.progress.done === today.progress.total;
  const frozenToday = today.stats.frozenDays.includes(today.today);

  useEffect(() => {
    if (allDone && !today.sessionCompleted) void grantSessionBonus(today.today);
  }, [allDone, today.sessionCompleted, today.today]);

  return (
    <>
      <PageTitle eyebrow={greeting(new Date().getHours())} title="Sua prática de hoje">
        {today.next ? (
          <Link
            to={`/tocar/${today.next.exercise?.id ?? ""}`}
            className="hidden h-10 items-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover md:inline-flex"
          >
            {today.progress.done === 0 ? "Começar" : "Continuar"}
          </Link>
        ) : null}
      </PageTitle>

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="grid content-start gap-6 md:w-64">
          <Card className="flex flex-col items-center gap-4">
            <ProgressRing value={today.todayXp} max={today.stats.dailyGoalXp} caption={`de ${today.stats.dailyGoalXp} XP`} />
            <p className="text-center text-body text-ink-muted">{streakSentence(today.streak, frozenToday)}</p>
            <p className="text-center text-caption text-ink-subtle">
              {today.todayMinutes} min hoje · {today.stats.resinas} resinas
            </p>
            {today.stats.freezers > 0 && !frozenToday && today.todayXp < today.stats.dailyGoalXp ? (
              <Button variant="ghost" onClick={() => void useFreezer(today.today)}>
                Congelar hoje ({today.stats.freezers})
              </Button>
            ) : null}
          </Card>
          <Card className="grid gap-2">
            <span className="text-caption text-ink-subtle">Rotina</span>
            <span className="font-medium">{today.routine.name}</span>
            <Link to="/praticar" className="text-caption font-semibold text-primary">
              Trocar rotina
            </Link>
          </Card>
        </div>

        <Card title={allDone ? "Sessão fechada" : "Sessão de hoje"}>
          {!today.coreReady ? <p className="text-ink-muted">Montando a sessão…</p> : null}
          {today.coreReady && allDone ? (
            <EmptyState
              title={`Tudo feito. +${SESSION_COMPLETE_XP} XP pela sessão completa.`}
              description="Quer continuar? Repita o bloco que ficou mais fraco ou abra uma música da biblioteca."
              action={
                <Link to="/musicas" className="font-semibold text-primary">
                  Ir para Músicas
                </Link>
              }
            />
          ) : null}
          {today.coreReady && !allDone ? (
            <div className="grid gap-3">
              <p className="text-caption text-ink-subtle">
                {today.progress.done} de {today.progress.total} blocos · {today.routine.durationMinutes} min
              </p>
              <ol className="divide-y divide-hairline">
                {today.plan.map((planned, index) => (
                  <BlockRow
                    key={`${planned.block.type}-${index}`}
                    planned={planned}
                    done={planned.exercise ? today.doneToday.has(planned.exercise.id) : false}
                    isNext={planned === today.next}
                  />
                ))}
              </ol>
              {today.next?.exercise ? (
                <Link
                  to={`/tocar/${today.next.exercise.id}`}
                  className="inline-flex h-11 w-fit items-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover md:h-10"
                >
                  Tocar {today.next.exercise.title}
                </Link>
              ) : null}
            </div>
          ) : null}
        </Card>
        <div className="md:col-span-2">
          <CadernoDaAula />
        </div>
      </div>
    </>
  );
}
