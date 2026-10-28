import { useState } from "react";

import type { Exercise } from "@fretless/core";

import { accuracyTrend } from "@/data/calendar";
import type { ExerciseResult } from "@/data/db";
import { Card } from "@/design/components";

const HISTORY_POINTS = 12;

interface HistoricoPrecisaoProps {
  results: readonly ExerciseResult[];
  exercises: readonly Exercise[];
}

function titleFor(exerciseId: string, exercises: readonly Exercise[]): string {
  return exercises.find((exercise) => exercise.id === exerciseId)?.title ?? exerciseId.replace(/^musica:/, "");
}

function barClass(accuracyPct: number): string {
  if (accuracyPct >= 90) return "bg-in-tune";
  if (accuracyPct >= 70) return "bg-close";
  return "bg-off";
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
      <select className="h-10 rounded-md border border-hairline bg-surface px-3 text-body" value={exerciseId} onChange={(event) => setSelected(event.target.value)} aria-label="Música">
        {repeated.map((id) => (
          <option key={id} value={id}>
            {titleFor(id, exercises)}
          </option>
        ))}
      </select>
      <ol className="flex h-32 items-end gap-2" aria-label="Precisão por execução">
        {points.map((point) => (
          <li key={point.playedAt} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-mono text-caption text-ink-subtle tabular">{Math.round(point.accuracyPct)}</span>
            <div className="flex w-full flex-1 items-end">
              <div className={`w-full rounded-sm ${barClass(point.accuracyPct)}`} style={{ height: `${Math.max(4, point.accuracyPct)}%` }} aria-label={`${Math.round(point.accuracyPct)}% a ${point.bpm} bpm`} />
            </div>
            <span className="font-mono text-caption text-ink-subtle tabular">{point.bpm}</span>
          </li>
        ))}
      </ol>
      <p className="text-caption text-ink-subtle">
        {trend ? (trend.delta >= 0 ? `Subiu ${trend.delta} pontos de precisão desde a primeira vez.` : `Caiu ${Math.abs(trend.delta)} pontos desde a primeira vez; tente mais devagar.`) : "Toque mais uma vez para ver a tendência."}
        {" "}Número de baixo é o andamento.
      </p>
    </Card>
  );
}
