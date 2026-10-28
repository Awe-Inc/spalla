import type { GameStats, MeasureRange, NoteJudgement, Score } from "@fretless/core";
import { Link } from "react-router";

import { ACHIEVEMENTS, MASTERY_LEVELS, type MasteryLevel } from "@/data/gamification";
import type { RunOutcome } from "@/data/progress";
import { Button, Stars } from "@/design/components";

import { hardestRange, measureStats, measureTone, type MeasureStat } from "./measureMap";
import { adviseTempo, type TempoLimits } from "./tempo";

interface ResultScreenProps {
  score: Score;
  stats: GameStats;
  judgements: readonly NoteJudgement[];
  outcome: RunOutcome | null;
  bpm: number;
  limits: TempoLimits;
  loop: MeasureRange | null;
  saveError: string | null;
  backTo: string;
  onPlayAgain: () => void;
  onRepeatHardest: (range: MeasureRange) => void;
  onChangeTempo: (bpm: number) => void;
}

const toneClass: Record<ReturnType<typeof measureTone>, string> = {
  unplayed: "bg-surface-soft text-ink-subtle",
  clean: "bg-in-tune-soft text-in-tune",
  shaky: "bg-close-soft text-close",
  hard: "bg-off-soft text-off",
};

function driftSentence(meanSignedCents: number): string {
  if (meanSignedCents > 3) return `Tendência de ${Math.round(meanSignedCents)} cents alto.`;
  if (meanSignedCents < -3) return `Tendência de ${Math.round(-meanSignedCents)} cents baixo.`;
  return "Afinação centrada.";
}

function headline(stats: GameStats, outcome: RunOutcome | null): string {
  if (outcome && outcome.mastery > outcome.masteryBefore) return "Subiu de nível!";
  if (stats.accuracyPct >= 95) return "Impecável.";
  if (stats.accuracyPct >= 80) return "Muito bem!";
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

export function ResultScreen({ score, stats, judgements, outcome, bpm, limits, loop, saveError, backTo, onPlayAgain, onRepeatHardest, onChangeTempo }: ResultScreenProps) {
  const perMeasure = measureStats(score, judgements);
  const hardest = loop ? null : hardestRange(perMeasure);
  const advice = adviseTempo(stats.accuracyPct, bpm, limits);

  return (
    <section className="grid justify-items-center gap-5 text-center" aria-label="Resultado">
      <p className="text-caption font-semibold text-primary">{headline(stats, outcome)}</p>
      <Stars count={outcome?.stars ?? 0} />
      <p className="font-display text-display">{Math.round(stats.accuracyPct)}% de precisão</p>
      {saveError ? <p className="text-caption text-off">{saveError}</p> : null}
      <p className="text-ink-muted">{driftSentence(stats.meanSignedCents)}</p>

      {outcome ? (
        <dl className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-center">
          <div>
            <dt className="text-caption text-ink-subtle">XP ganho</dt>
            <dd className="font-mono text-numeric tabular text-primary">+{outcome.xp}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-subtle">Maior sequência</dt>
            <dd className="font-mono text-numeric tabular">{stats.maxCombo}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-subtle">Maestria</dt>
            <dd className="font-mono text-numeric tabular">
              {Math.max(outcome.mastery, outcome.masteryBefore)}/5 · {masteryName(Math.max(outcome.mastery, outcome.masteryBefore) as MasteryLevel)}
            </dd>
          </div>
        </dl>
      ) : null}

      {outcome && outcome.newAchievements.length > 0 ? (
        <ul className="grid gap-2" aria-label="Conquistas desbloqueadas">
          {outcome.newAchievements.map((id) => {
            const achievement = ACHIEVEMENTS.find((item) => item.id === id);
            return (
              <li key={id} className="rounded-md bg-primary-soft px-4 py-2 text-body">
                <span className="font-semibold">Conquista: {achievement?.name ?? id}</span>
                {achievement ? <span className="text-ink-muted"> · {achievement.description}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {perMeasure.length > 1 ? (
        <div className="grid w-full max-w-xl gap-2">
          <span className="text-caption text-ink-subtle">Por compasso</span>
          <ol className="flex flex-wrap justify-center gap-1.5" aria-label="Precisão por compasso">
            {perMeasure.map((stat) => (
              <li key={stat.measureIndex} title={measureTitle(stat)} className={`grid h-9 w-9 place-items-center rounded-sm font-mono text-caption tabular ${toneClass[measureTone(stat)]}`}>
                {stat.measureNumber}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {advice.kind === "slow-down" ? (
        <p className="max-w-prose text-ink-muted">
          Ficou corrido. Que tal tentar a {advice.bpm} bpm?{" "}
          <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onChangeTempo(advice.bpm)}>
            Diminuir o andamento
          </button>
        </p>
      ) : null}
      {advice.kind === "speed-up" ? (
        <p className="max-w-prose text-ink-muted">
          Limpo! Dá para subir para {advice.bpm} bpm.{" "}
          <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onChangeTempo(advice.bpm)}>
            Acelerar
          </button>
        </p>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" onClick={onPlayAgain}>
          Tocar de novo
        </Button>
        {hardest ? (
          <Button onClick={() => onRepeatHardest(hardest)}>
            Repetir compassos {hardest.firstIndex + 1}–{hardest.lastIndex + 1}
          </Button>
        ) : null}
        <Link to={backTo} className="inline-flex h-11 items-center rounded-pill bg-surface-soft px-5 font-semibold md:h-10">
          Voltar
        </Link>
      </div>
    </section>
  );
}
