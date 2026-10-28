import type { Exercise } from "@fretless/core";

import type { ExerciseResult } from "@/data/db";
import { countSentence, driftSentence, exerciseHistory, lastPlayedSentence, seriesSentence, tempoSentence, trendSentence } from "@/data/history";
import { AccuracyBars, Stars } from "@/design/components";

interface HistoricoExercicioProps {
  exercise: Exercise;
  results: readonly ExerciseResult[];
  now?: number;
}

export function HistoricoExercicio({ exercise, results, now = Date.now() }: HistoricoExercicioProps) {
  const history = exerciseHistory(results, exercise.id);
  if (!history) {
    return <p className="rounded-md bg-surface-soft px-4 py-3 text-caption text-ink-muted">Ainda não tocado. A primeira execução abre o histórico.</p>;
  }
  const series = seriesSentence(history);
  return (
    <section className="grid gap-3 rounded-md bg-surface-soft p-4" aria-label={`Histórico de ${exercise.title}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-muted">
        <span>
          {countSentence(history)} Última vez {lastPlayedSentence(history.latest.playedAt, now)}.
        </span>
        <Stars count={history.best.stars} label={`melhor: ${Math.round(history.best.accuracyPct)}% a ${history.best.bpm} bpm`} />
      </div>
      <AccuracyBars bars={history.recent.map((run) => ({ key: run.id ?? run.playedAt, accuracyPct: run.accuracyPct, bpm: run.bpm }))} label={`Precisão das últimas execuções de ${exercise.title}`} className="h-24" />
      <ul className="grid gap-1 text-caption text-ink-muted">
        <li>{trendSentence(history)}</li>
        <li>{tempoSentence(history, exercise.defaultBpm)}</li>
        <li>{driftSentence(history.meanDriftCents)}</li>
        {series ? <li>{series}</li> : null}
      </ul>
    </section>
  );
}
