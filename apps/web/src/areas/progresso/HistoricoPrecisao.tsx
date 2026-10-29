import { useState } from "react";

import type { Exercise } from "@fretless/core";

import { accuracyTrend } from "@/data/calendar";
import type { ExerciseResult } from "@/data/db";
import { AccuracyBars, Card } from "@/design/components";
import { FIELD_CLASS } from "@/design/fields";

const HISTORY_POINTS = 12;

interface HistoricoPrecisaoProps {
  results: readonly ExerciseResult[];
  exercises: readonly Exercise[];
}

function titleFor(exerciseId: string, exercises: readonly Exercise[]): string {
  return exercises.find((exercise) => exercise.id === exerciseId)?.title ?? exerciseId.replace(/^musica:/, "");
}

export function HistoricoPrecisao({ results, exercises }: HistoricoPrecisaoProps) {
  const counts = new Map<string, number>();
  for (const result of results) counts.set(result.exerciseId, (counts.get(result.exerciseId) ?? 0) + 1);
  const repeated = [...counts.entries()].filter(([, count]) => count >= 2).map(([id]) => id);
  const [selected, setSelected] = useState<string | null>(null);
  const exerciseId = selected && repeated.includes(selected) ? selected : repeated[0] ?? null;

  if (!exerciseId) {
    return (
      <Card title="Evolução por música">
        <p className="text-ink-muted">Toque a mesma música duas vezes e a evolução da afinação aparece aqui.</p>
      </Card>
    );
  }

  const points = results
    .filter((result) => result.exerciseId === exerciseId)
    .sort((a, b) => a.playedAt - b.playedAt)
    .slice(-HISTORY_POINTS);
  const trend = accuracyTrend(points);

  return (
    <Card title="Evolução por música" className="grid gap-4">
      <select className={`${FIELD_CLASS} cursor-pointer pr-8`} value={exerciseId} onChange={(event) => setSelected(event.target.value)} aria-label="Música">
        {repeated.map((id) => (
          <option key={id} value={id}>
            {titleFor(id, exercises)}
          </option>
        ))}
      </select>
      <AccuracyBars bars={points.map((point) => ({ key: point.playedAt, accuracyPct: point.accuracyPct, bpm: point.bpm }))} label="Precisão por execução" />
      <p className="text-caption text-ink-subtle">
        {trend ? (trend.delta >= 0 ? `Subiu ${trend.delta} pontos de precisão desde a primeira vez.` : `Caiu ${Math.abs(trend.delta)} pontos desde a primeira vez; tente mais devagar.`) : "Toque mais uma vez para ver a tendência."}
        {" "}Número de baixo é o andamento.
      </p>
    </Card>
  );
}
