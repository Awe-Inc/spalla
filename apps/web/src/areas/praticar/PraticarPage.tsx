import type { CurriculumModule } from "@fretless/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link } from "react-router";

import { useRoutines } from "@/areas/hoje/useTodayPlan";
import { useCore } from "@/core/useCore";
import { bestResultsByExercise, db, type ExerciseResult } from "@/data/db";
import { Card, InlineError, PageTitle, Stars } from "@/design/components";

import { RoutinePicker } from "./RoutinePicker";

function ModuleCard({ module, best }: { module: CurriculumModule; best: Map<string, ExerciseResult> }) {
  const [open, setOpen] = useState(false);
  const playable = module.exercises.filter((exercise) => exercise.playable);
  const starred = playable.filter((exercise) => (best.get(exercise.id)?.stars ?? 0) === 3).length;
  return (
    <Card as="article" className="grid gap-4">
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h2 className="text-heading font-semibold">
            <button type="button" className="text-left after:absolute after:inset-0" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
              {module.title}
            </button>
          </h2>
          <p className="text-ink-muted">{module.tagline}</p>
        </div>
        <span className="shrink-0 font-mono text-caption text-ink-subtle tabular">
          {starred}/{playable.length}
        </span>
      </div>
      {open ? (
        <ul className="divide-y divide-hairline">
          {playable.map((exercise) => (
            <li key={exercise.id} className="flex items-center justify-between gap-4 py-3">
              <Link to={`/tocar/${exercise.id}`} className="grid gap-0.5 hover:text-primary">
                <span className="font-medium">{exercise.title}</span>
                <span className="text-caption text-ink-subtle">
                  {exercise.subtitle} · {exercise.defaultBpm} bpm
                </span>
              </Link>
              <Stars count={best.get(exercise.id)?.stars ?? 0} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="max-w-prose text-body text-ink-muted">{module.description}</p>
      )}
    </Card>
  );
}

export function PraticarPage() {
  const core = useCore();
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];
  const best = bestResultsByExercise(results);
  const routines = useRoutines();

  return (
    <>
      <PageTitle title="Praticar" eyebrow="Rotina e módulos do método" />
      <div className="mb-6">
        <RoutinePicker routines={routines} />
      </div>
      {core.status === "loading" ? <p className="text-ink-muted">Carregando módulos…</p> : null}
      {core.status === "error" ? <InlineError title="Os módulos não carregaram." nextStep={core.message} /> : null}
      {core.status === "ready" ? (
        <div className="grid gap-4">
          {core.core.curriculum.map((module) => (
            <ModuleCard key={module.id} module={module} best={best} />
          ))}
        </div>
      ) : null}
    </>
  );
}
