import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { Link } from "react-router";

import { db } from "@/data/db";
import { SESSION_COMPLETE_XP } from "@/data/gamification";
import { blockProgress, type PlannedBlock, type RunsByExercise } from "@/data/planner";
import { grantSessionBonus } from "@/data/progress";
import { goalSentence } from "@/data/repetitions";
import { BLOCK_LABELS } from "@/data/routines";
import { dueReviews } from "@/data/suzuki";
import { Card, EmptyState, GoalDots, PageTitle, ProgressRing } from "@/design/components";

import { CadernoDaAula } from "./CadernoDaAula";
import { TarefasDaTurma } from "./TarefasDaTurma";
import { useClassAssignmentsRefresh, useTodayPlan } from "./useTodayPlan";

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

function BlockRow({ planned, runsToday, isNext }: { planned: PlannedBlock; runsToday: RunsByExercise; isNext: boolean }) {
  const item = planned.item;
  const progress = blockProgress(planned, runsToday);
  const done = progress?.complete ?? false;
  const goal = progress ? goalSentence(planned.block, progress) : null;
  const toneClass = done ? "text-ink-subtle line-through" : isNext ? "text-ink" : "text-ink-muted";
  return (
    <li className={`grid gap-1 py-3 ${isNext ? "border-l-2 border-primary pl-4" : "pl-4"}`}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-caption text-ink-subtle">
          {BLOCK_LABELS[planned.block.type]} · {planned.block.durationMinutes} min
        </span>
        {planned.assignmentId ? <span className="rounded-pill bg-primary-soft px-2 text-caption text-primary">Da turma</span> : null}
        {planned.fromLesson ? <span className="rounded-pill bg-info-soft px-2 text-caption text-info">Da aula</span> : null}
      </div>
      {item ? (
        <Link to={item.playPath} className={`font-medium hover:text-primary ${toneClass}`}>
          {item.title}
          {planned.targetBpm ? <span className="ml-2 font-mono text-caption text-primary tabular">→ {planned.targetBpm} bpm</span> : null}
        </Link>
      ) : (
        <span className="text-ink-subtle">{planned.reason}</span>
      )}
      {item ? (
        <span className="text-caption text-ink-subtle">
          {planned.reason}
          {planned.variation ? ` · Hoje: ${planned.variation}.` : ""}
        </span>
      ) : null}
      {progress && goal ? (
        <span className="flex items-center gap-2 text-caption text-ink-muted">
          <GoalDots recentClean={progress.recentClean} total={progress.total} label={goal} />
          <span aria-hidden>{goal}</span>
        </span>
      ) : null}
    </li>
  );
}

function SuzukiReminder({ today }: { today: string }) {
  const due = dueReviews(useLiveQuery(() => db.suzukiPieces.toArray(), []) ?? [], today);
  if (due.length === 0) return null;
  return (
    <Card className="grid gap-2">
      <span className="text-caption text-ink-subtle">Revisão Suzuki</span>
      <span className="font-medium">
        {due.length} {due.length === 1 ? "peça para revisar hoje" : "peças para revisar hoje"}
      </span>
      <Link to="/musicas/suzuki" className="text-caption font-semibold text-primary">
        Abrir a trilha
      </Link>
    </Card>
  );
}

export function HojePage() {
  const today = useTodayPlan();
  const allDone = today.progress.total > 0 && today.progress.done === today.progress.total;
  const frozenToday = today.stats.frozenDays.includes(today.today);
  useClassAssignmentsRefresh();

  useEffect(() => {
    if (allDone && !today.sessionCompleted) void grantSessionBonus(today.today);
  }, [allDone, today.sessionCompleted, today.today]);

  return (
    <>
      <PageTitle eyebrow={greeting(new Date().getHours())} title="Sua prática de hoje">
        {today.next ? (
          <Link
            to={today.next.item?.playPath ?? "/praticar"}
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
            <p className="text-center text-caption text-ink-subtle">{today.todayMinutes} min hoje</p>
          </Card>
          <Card className="grid gap-2">
            <span className="text-caption text-ink-subtle">Rotina</span>
            <span className="font-medium">{today.routine.name}</span>
            <Link to="/praticar" className="text-caption font-semibold text-primary">
              Trocar rotina
            </Link>
          </Card>
          <SuzukiReminder today={today.today} />
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
                    runsToday={today.runsToday}
                    isNext={planned === today.next}
                  />
                ))}
              </ol>
              {today.next?.item ? (
                <Link
                  to={today.next.item.playPath}
                  className="inline-flex h-11 w-fit items-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover md:h-10"
                >
                  Tocar {today.next.item.title}
                </Link>
              ) : null}
            </div>
          ) : null}
        </Card>
        <div className="grid gap-6 md:col-span-2">
          <TarefasDaTurma />
          <CadernoDaAula />
        </div>
      </div>
    </>
  );
}
