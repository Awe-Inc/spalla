import type { CurriculumModule, Exercise } from "@fretless/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link } from "react-router";

import { useRoutines } from "@/areas/hoje/useTodayPlan";
import { useCore } from "@/core/useCore";
import { bestResultsByExercise, db, type ExerciseResult } from "@/data/db";
import { Card, InlineError, PageTitle, Stars } from "@/design/components";

import { HistoricoExercicio } from "./HistoricoExercicio";
import { RoutinePicker } from "./RoutinePicker";

const HISTORY_BUTTON_CLASS = "rounded-sm px-2 py-1 text-caption text-ink-subtle transition-colors duration-fast ease-fretless hover:bg-surface-sunken hover:text-ink";

function ExerciseRow({ exercise, best, results }: { exercise: Exercise; best: ExerciseResult | undefined; results: readonly ExerciseResult[] }) {
  const [showHistory, setShowHistory] = useState(false);
  const played = best !== undefined;
  return (
    <li className="grid gap-3 py-3">
      <div className="flex items-center justify-between gap-4">
        <Link to={`/tocar/${exercise.id}`} className="grid gap-0.5 hover:text-primary">
          <span className="font-medium">{exercise.title}</span>
          <span className="text-caption text-ink-subtle">
            {exercise.subtitle} · {exercise.defaultBpm} bpm
          </span>
        </Link>
        <span className="flex shrink-0 items-center gap-2">
          {played ? (
            <button type="button" className={HISTORY_BUTTON_CLASS} aria-expanded={showHistory} aria-label={`Histórico de ${exercise.title}`} onClick={() => setShowHistory((value) => !value)}>
              Histórico
            </button>
          ) : null}
          <Stars count={best?.stars ?? 0} />
        </span>
      </div>
      {showHistory ? <HistoricoExercicio exercise={exercise} results={results} /> : null}
    </li>
  );
}

function ModuleCard({ module, best, results }: { module: CurriculumModule; best: Map<string, ExerciseResult>; results: readonly ExerciseResult[] }) {
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
            <ExerciseRow key={exercise.id} exercise={exercise} best={best.get(exercise.id)} results={results} />
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
            <ModuleCard key={module.id} module={module} best={best} results={results} />
          ))}
        </div>
      ) : null}
    </>
  );
}
