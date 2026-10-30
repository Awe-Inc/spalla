import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { Link } from "react-router";

import { useClassAssignments } from "@/account/classAssignments";
import { useSettings } from "@/app/settings";
import { fromState } from "@/areas/tocar/origin";
import { db } from "@/data/db";
import { SESSION_COMPLETE_XP } from "@/data/gamification";
import { nextLessonSentence, splitTasks } from "@/data/lessons";
import { blockProgress, type PlannedBlock, type RunsByExercise } from "@/data/planner";
import { grantSessionBonus } from "@/data/progress";
import { goalSentence } from "@/data/repetitions";
import { BLOCK_LABELS } from "@/data/routines";
import { dueReviews } from "@/data/suzuki";
import { ButtonLink, Card, EmptyState, GoalDots, ProgressRing } from "@/design/components";
import { Icon, type IconName } from "@/design/icons";
import { PageHeader, SkeletonList } from "@/design/layout";

import { useClassAssignmentsRefresh, useTodayPlan } from "./useTodayPlan";

const STAGGER_MS = 40;
const FROM_TODAY = fromState("/");

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

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function BlockMarker({ index, done, current }: { index: number; done: boolean; current: boolean }) {
  const tone = done ? "bg-in-tune-soft text-in-tune" : current ? "bg-primary text-on-primary" : "bg-surface-soft text-ink-muted";
  return (
    <span aria-hidden className={`flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-small tabular ${tone}`}>
      {done ? <Icon name="confirmar" className="size-4" /> : index + 1}
    </span>
  );
}

function BlockOrigin({ planned }: { planned: PlannedBlock }) {
  if (planned.assignmentId) return <span className="rounded-sm bg-primary-soft px-1.5 text-caption text-primary">Da turma</span>;
  if (planned.fromLesson) return <span className="rounded-sm bg-info-soft px-1.5 text-caption text-info">Da aula</span>;
  return null;
}

interface BlockRowProps {
  planned: PlannedBlock;
  index: number;
  runsToday: RunsByExercise;
  current: boolean;
}

function BlockRow({ planned, index, runsToday, current }: BlockRowProps) {
  const item = planned.item;
  const progress = blockProgress(planned, runsToday);
  const done = progress?.complete ?? false;
  const goal = progress ? goalSentence(planned.block, progress) : null;
  const titleTone = done ? "text-ink-subtle line-through decoration-hairline-strong" : "text-ink";
  return (
    <li
      aria-current={current ? "step" : undefined}
      style={{ animationDelay: `${index * STAGGER_MS}ms` }}
      className={`relative flex animate-rise gap-4 rounded-md px-3 py-3 transition-colors duration-fast ease-spalla ${current ? "bg-primary-soft/60" : item ? "hover:bg-surface-soft" : ""}`}
    >
      <BlockMarker index={index} done={done} current={current} />
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-subtle">
          <span>{BLOCK_LABELS[planned.block.type]}</span>
          <span aria-hidden>/</span>
          <span className="font-mono tabular">{planned.block.durationMinutes} min</span>
          <BlockOrigin planned={planned} />
        </div>
        {item ? (
          <Link
            to={item.playPath}
            state={FROM_TODAY}
            className={`w-fit max-w-full truncate text-body font-semibold after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus ${titleTone}`}
          >
            {item.title}
          </Link>
        ) : (
          <span className="text-body text-ink-subtle">{planned.reason}</span>
        )}
        {item ? (
          <span className="text-small text-ink-muted">
            {planned.reason}
            {planned.variation ? ` Hoje: ${planned.variation}.` : ""}
            {planned.targetBpm ? <span className="ml-2 font-mono text-primary tabular">{planned.targetBpm} bpm</span> : null}
          </span>
        ) : null}
        {progress && goal ? (
          <span className="flex items-center gap-2 text-small text-ink-muted">
            <GoalDots recentClean={progress.recentClean} total={progress.total} label={goal} />
            <span aria-hidden>{goal}</span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

interface Notice {
  key: string;
  icon: IconName;
  text: string;
  to?: string;
}

function useNotices(today: string): Notice[] {
  const suzuki = useLiveQuery(() => db.suzukiPieces.toArray(), []) ?? [];
  const lessonTasks = useLiveQuery(() => db.lessonTasks.toArray(), []) ?? [];
  const assignments = useClassAssignments();
  const lessonWeekday = useSettings((state) => state.lessonWeekday);
  const openTasks = splitTasks(lessonTasks).open.length + assignments.filter((assignment) => assignment.doneAt === null).length;
  const due = dueReviews(suzuki, today).length;
  const nextLesson = nextLessonSentence(lessonWeekday, new Date());
  const notices: Notice[] = [];
  if (openTasks > 0) notices.push({ key: "tarefas", icon: "aulas", text: plural(openTasks, "tarefa da aula", "tarefas da aula"), to: "/estudar/caderno" });
  if (due > 0) notices.push({ key: "suzuki", icon: "repertorio", text: `Revisão Suzuki: ${plural(due, "peça", "peças")}`, to: "/repertorio/suzuki" });
  if (nextLesson) notices.push({ key: "aula", icon: "estudar", text: nextLesson.replace(/\.$/, ""), to: "/estudar/caderno" });
  return notices;
}

function NoticeStrip({ notices }: { notices: readonly Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <ul aria-label="Avisos" className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
      {notices.map((notice) => (
        <li key={notice.key} className="min-w-0">
          <Link
            to={notice.to ?? "/"}
            className="group flex min-h-14 items-center gap-3 rounded-md bg-surface-sunken px-4 text-small font-medium text-ink ring-1 ring-inset ring-hairline transition-colors duration-fast ease-spalla hover:bg-surface-soft"
          >
            <Icon name={notice.icon} className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">{notice.text}</span>
            <Icon name="avancar" className="size-4 shrink-0 text-ink-subtle transition-transform duration-fast ease-spalla group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HojePage() {
  const today = useTodayPlan();
  const notices = useNotices(today.today);
  const allDone = today.progress.total > 0 && today.progress.done === today.progress.total;
  const frozenToday = today.stats.frozenDays.includes(today.today);
  useClassAssignmentsRefresh();

  useEffect(() => {
    if (allDone && !today.sessionCompleted) void grantSessionBonus(today.today);
  }, [allDone, today.sessionCompleted, today.today]);

  const nextItem = today.next?.item ?? null;

  return (
    <>
      <PageHeader title={greeting(new Date().getHours())} description={streakSentence(today.streak, frozenToday)} size="display" />

      <div className="grid gap-6">
        <Card tone="hero" className="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:gap-10">
          <div className="grid gap-5 md:sticky md:top-10 md:w-64 md:justify-items-center">
            <div className="flex items-center gap-5 md:flex-col md:gap-3">
              <ProgressRing value={today.todayXp} max={today.stats.dailyGoalXp} caption={`de ${today.stats.dailyGoalXp} XP`} size={152} />
              <p className="text-small text-ink-muted md:text-center">
                <span className="font-mono text-ink tabular">{today.todayMinutes}</span> min tocados hoje
              </p>
            </div>
            {today.coreReady && nextItem ? (
              <div className="grid w-full gap-2">
                <p className="text-small text-ink-muted md:text-center">
                  Próximo: <span className="font-semibold text-ink">{nextItem.title}</span>
                </p>
                <ButtonLink variant="primary" size="lg" icon="play" to={nextItem.playPath} state={FROM_TODAY} className="w-full" aria-label={`Tocar agora: ${nextItem.title}`}>
                  Tocar agora
                </ButtonLink>
              </div>
            ) : null}
          </div>

          <div className="grid min-w-0 gap-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-heading font-semibold">{allDone ? "Sessão fechada" : "Sessão de hoje"}</h2>
              <p className="text-small text-ink-muted">
                <span className="tabular">
                  {today.progress.done} de {today.progress.total} blocos
                </span>{" "}
                / {today.routine.durationMinutes} min
              </p>
            </div>

            {!today.coreReady ? <SkeletonList rows={3} label="Montando a sessão…" /> : null}

            {today.coreReady && allDone ? (
              <EmptyState
                title={`Tudo feito. +${SESSION_COMPLETE_XP} XP pela sessão completa.`}
                description="Quer continuar? Repita o bloco que ficou mais fraco ou abra uma peça do repertório."
                action={<ButtonLink to="/repertorio">Abrir o repertório</ButtonLink>}
              />
            ) : null}

            {today.coreReady && !allDone ? (
              <ol aria-label="Blocos da sessão" className="-mx-3 grid gap-1">
                {today.plan.map((planned, index) => (
                  <BlockRow key={`${planned.block.type}-${index}`} planned={planned} index={index} runsToday={today.runsToday} current={planned === today.next} />
                ))}
              </ol>
            ) : null}

            <div className="border-t border-hairline pt-5">
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-small text-ink-muted">
                Rotina
                <span className="font-semibold text-ink">{today.routine.name}</span>
                <Link to="/estudar" className="font-semibold text-primary underline-offset-4 hover:underline">
                  trocar
                </Link>
              </p>
            </div>
          </div>
        </Card>

        <NoticeStrip notices={notices} />
      </div>
    </>
  );
}
