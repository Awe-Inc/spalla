import type { GameStats, MeasureRange, NoteJudgement, Score } from "@fretless/core";
import type { BlockGoal } from "@/areas/hoje/useTodayPlan";
import { ACHIEVEMENTS, MASTERY_LEVELS, type MasteryLevel } from "@/data/gamification";
import { driftSentence, unheardSentence } from "@/data/history";
import { earnedMedalTitle } from "@/data/medals";
import type { RunOutcome } from "@/data/progress";
import { goalSentence } from "@/data/repetitions";
import { Button, ButtonLink, Card, GoalDots, Stars } from "@/design/components";
import { Stat, Stats } from "@/design/layout";

import type { TocarOrigin } from "./origin";

import { slowdownSentence, type Slowdown } from "./autoSlowdown";
import { hardestRange, measureStats, measureTone, type MeasureStat } from "./measureMap";
import { adviseTempo, type TempoAdvice, type TempoLimits } from "./tempo";

interface ResultScreenProps {
  score: Score;
  stats: GameStats;
  judgements: readonly NoteJudgement[];
  outcome: RunOutcome | null;
  goal: BlockGoal | null;
  bpm: number;
  limits: TempoLimits;
  loop: MeasureRange | null;
  slowdown: Slowdown | null;
  saveError: string | null;
  completedTasks: readonly string[];
  back: TocarOrigin;
  next: NextBlockLink | null;
  onPlayAgain: () => void;
  onRepeatHardest: (range: MeasureRange) => void;
  onChangeTempo: (bpm: number) => void;
  onKeepTempo: (bpm: number) => void;
}

export interface NextBlockLink {
  title: string;
  to: string;
  state: { from: string };
}

const KEEP_TEMPO: TempoAdvice = { kind: "keep" };

const toneClass: Record<ReturnType<typeof measureTone>, string> = {
  unplayed: "bg-surface-soft text-ink-subtle",
  clean: "bg-in-tune-soft text-in-tune",
  shaky: "bg-close-soft text-close",
  hard: "bg-off-soft text-off",
};

function headline(stats: GameStats, outcome: RunOutcome | null): string {
  if (outcome && outcome.mastery > outcome.masteryBefore) return "Subiu de nível.";
  if (stats.accuracyPct >= 95) return "Impecável.";
  if (stats.accuracyPct >= 80) return "Muito bem.";
  if (stats.accuracyPct >= 60) return "Está chegando lá.";
  return "Cada tentativa conta.";
}

function masteryName(level: MasteryLevel): string {
  return MASTERY_LEVELS.find((item) => item.level === level)?.name ?? "—";
}

function measureTitle(stat: MeasureStat): string {
  if (stat.accuracyPct === null) return `Compasso ${stat.measureNumber}: não tocado`;
  return `Compasso ${stat.measureNumber}: ${Math.round(stat.accuracyPct)}% certas`;
}

function seriesSentence(goal: BlockGoal): string {
  if (goal.raiseTempo) return "Três séries fechadas em dias diferentes: hora de subir o andamento ou trocar a variação.";
  if (goal.progress.complete) return "Série fechada. Amanhã ela conta de novo.";
  const lastClean = goal.progress.recentClean.at(-1) ?? true;
  if (lastClean) return "Toque de novo para seguir a série.";
  const hadStreak = goal.progress.recentClean.slice(0, -1).some((clean) => clean);
  return hadStreak ? "A série zerou. Mais devagar e de novo." : "Essa não contou: a série pede 90% ou mais.";
}

function TempoAdviceNote({ slowdown, advice, onKeepTempo, onChangeTempo }: { slowdown: Slowdown | null; advice: TempoAdvice; onKeepTempo: (bpm: number) => void; onChangeTempo: (bpm: number) => void }) {
  if (slowdown) {
    return (
      <Card tone="inset" className="flex flex-wrap items-center justify-between gap-3 text-left" as="div">
        <p className="min-w-0 flex-1 text-small text-ink-muted" aria-label="Andamento reduzido">
          {slowdownSentence(slowdown)}
        </p>
        <Button variant="quiet" onClick={() => onKeepTempo(slowdown.fromBpm)}>
          Manter {slowdown.fromBpm} bpm
        </Button>
      </Card>
    );
  }
  if (advice.kind === "keep") return null;
  const isSlowDown = advice.kind === "slow-down";
  return (
    <Card tone="inset" className="flex flex-wrap items-center justify-between gap-3 text-left" as="div">
      <p className="min-w-0 flex-1 text-small text-ink-muted">
        {isSlowDown ? `Ficou corrido. Tente a ${advice.bpm} bpm.` : `Saiu limpo. Dá para subir para ${advice.bpm} bpm.`}
      </p>
      <Button variant="quiet" onClick={() => onChangeTempo(advice.bpm)}>
        {isSlowDown ? "Diminuir o andamento" : "Acelerar"}
      </Button>
    </Card>
  );
}

function MeasureMap({ perMeasure }: { perMeasure: readonly MeasureStat[] }) {
  return (
    <div className="grid w-full gap-2 text-left">
      <h3 className="text-small font-semibold text-ink-muted">Por compasso</h3>
      <ol className="flex flex-wrap gap-1.5" aria-label="Precisão por compasso">
        {perMeasure.map((stat) => (
          <li key={stat.measureIndex} title={measureTitle(stat)} className={`grid size-9 place-items-center rounded-sm font-mono text-caption tabular ${toneClass[measureTone(stat)]}`}>
            {stat.measureNumber}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Rewards({ outcome }: { outcome: RunOutcome }) {
  const items = [
    ...(outcome.rankUp ? [{ key: "rank", title: `Nova patente: ${outcome.rankUp.title}`, description: outcome.rankUp.description }] : []),
    ...outcome.newMedals.map((medal) => ({ key: `m-${medal.id}`, title: `Medalha: ${earnedMedalTitle(medal)}`, description: "Fica na sua galeria em Você › Progresso." })),
    ...outcome.newAchievements.map((id) => {
      const achievement = ACHIEVEMENTS.find((item) => item.id === id);
      return { key: `a-${id}`, title: `Conquista: ${achievement?.name ?? id}`, description: achievement?.description ?? "" };
    }),
  ];
  return (
    <>
      {items.length > 0 ? (
        <ul className="grid w-full gap-2 text-left" aria-label="Conquistas e medalhas novas">
          {items.map((item) => (
            <li key={item.key} className="grid animate-rise gap-0.5 rounded-md bg-primary-soft px-4 py-3 motion-reduce:animate-none">
              <span className="font-semibold text-ink">{item.title}</span>
              {item.description ? <span className="text-small text-ink-muted">{item.description}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {outcome.closeMedals.length > 0 ? (
        <section className="grid w-full gap-1 text-left" aria-label="Falta pouco">
          <h3 className="text-small font-semibold text-ink-muted">Falta pouco</h3>
          <ul className="grid gap-1">
            {outcome.closeMedals.map((sentence) => (
              <li key={sentence} className="text-small text-ink-muted">
                {sentence}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export function ResultScreen({ score, stats, judgements, outcome, goal, bpm, limits, loop, slowdown, saveError, completedTasks, back, next, onPlayAgain, onRepeatHardest, onChangeTempo, onKeepTempo }: ResultScreenProps) {
  const perMeasure = measureStats(score, judgements);
  const hardest = loop ? null : hardestRange(perMeasure);
  const advice = slowdown ? KEEP_TEMPO : adviseTempo(stats.accuracyPct, bpm, limits);
  const goalLabel = goal ? goalSentence(goal.block, goal.progress) : null;
  const unheardLabel = unheardSentence(stats.unheard);
  const mastery = outcome ? (Math.max(outcome.mastery, outcome.masteryBefore) as MasteryLevel) : null;

  return (
    <section className="mx-auto grid w-full max-w-2xl gap-5 text-center" aria-label="Resultado">
      <Card tone="hero" as="div" className="grid justify-items-center gap-4">
        <p className="text-small font-semibold text-primary">{headline(stats, outcome)}</p>
        <Stars count={outcome?.stars ?? 0} size="lg" isRevealed />
        <p className="font-display text-display text-balance">{Math.round(stats.accuracyPct)}% de precisão</p>
        <p className="max-w-prose text-ink-muted">{driftSentence(stats.meanSignedCents)}</p>
        {unheardLabel ? <p className="max-w-prose text-small text-ink-muted">{unheardLabel}</p> : null}
        {saveError ? <p className="text-small text-off">{saveError}</p> : null}
        {completedTasks.map((sentence) => (
          <p key={sentence} className="rounded-sm bg-in-tune-soft px-3 py-1 text-small font-semibold text-in-tune">
            {sentence}
          </p>
        ))}
        {outcome && mastery ? (
          <Stats label="Desta passada" className="w-full justify-center border-t border-hairline pt-4">
            <Stat label="XP ganho" value={`+${outcome.xp}`} tone="primary" />
            <Stat label="Maior sequência" value={stats.maxCombo} />
            <Stat label={`Maestria: ${masteryName(mastery)}`} value={`${mastery}/5`} />
          </Stats>
        ) : null}
      </Card>

      {goal && goalLabel && outcome ? (
        <Card tone="inset" as="div" className="grid justify-items-center gap-2">
          <div className="grid justify-items-center gap-2" aria-label="Meta do bloco" role="group">
            <GoalDots recentClean={goal.progress.recentClean} total={goal.progress.total} label={goalLabel} />
            <p className="font-medium" aria-hidden>
              {goalLabel}
            </p>
            <p className="text-small text-ink-muted">{seriesSentence(goal)}</p>
          </div>
        </Card>
      ) : null}

      {outcome ? <Rewards outcome={outcome} /> : null}
      <TempoAdviceNote slowdown={slowdown} advice={advice} onKeepTempo={onKeepTempo} onChangeTempo={onChangeTempo} />
      {perMeasure.length > 1 ? <MeasureMap perMeasure={perMeasure} /> : null}

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        {next ? (
          <ButtonLink variant="primary" size="lg" to={next.to} state={next.state} icon="play">
            Próximo bloco: {next.title}
          </ButtonLink>
        ) : null}
        <Button variant={next ? "secondary" : "primary"} size={next ? "md" : "lg"} icon="play" onClick={onPlayAgain}>
          Tocar de novo
        </Button>
        {hardest ? (
          <Button icon="trecho" onClick={() => onRepeatHardest(hardest)}>
            Repetir compassos {hardest.firstIndex + 1}–{hardest.lastIndex + 1}
          </Button>
        ) : null}
        <ButtonLink variant="quiet" to={back.to} icon="voltar">
          Voltar para {back.label}
        </ButtonLink>
      </div>
    </section>
  );
}
