import type { CurriculumModule } from "@fretless/core";
import { useLiveQuery } from "dexie-react-hooks";

import { useCore } from "@/core/useCore";
import { bestResultsByExercise, db, type ExerciseResult } from "@/data/db";
import { InlineError } from "@/design/components";
import { List, ListRow, SkeletonList } from "@/design/layout";

import { EstudarHeader } from "./EstudarTabs";

const FULL_STARS = 3;

function ModuleProgress({ module, best }: { module: CurriculumModule; best: Map<string, ExerciseResult> }) {
  const playable = module.exercises.filter((exercise) => exercise.playable);
  const starred = playable.filter((exercise) => (best.get(exercise.id)?.stars ?? 0) === FULL_STARS).length;
  const ratio = playable.length > 0 ? starred / playable.length : 0;
  return (
    <span className="grid w-24 justify-items-end gap-1.5">
      <span className="font-mono text-small text-ink tabular">
        {starred}/{playable.length}
        <span className="sr-only"> exercícios com três estrelas</span>
      </span>
      <span aria-hidden className="h-1 w-full overflow-hidden rounded-pill bg-surface-sunken">
        <span className="block h-full origin-left rounded-pill bg-primary" style={{ transform: `scaleX(${ratio})` }} />
      </span>
    </span>
  );
}

export function MetodoPage() {
  const core = useCore();
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];
  const best = bestResultsByExercise(results);

  return (
    <>
      <EstudarHeader />
      {core.status === "loading" ? <SkeletonList rows={5} label="Carregando módulos…" /> : null}
      {core.status === "error" ? <InlineError title="Os módulos não carregaram." nextStep={core.message} /> : null}
      {core.status === "ready" ? (
        <List label="Módulos do método">
          {core.core.curriculum.map((module) => (
            <ListRow key={module.id} to={`/estudar/modulo/${module.id}`} title={module.title} meta={module.tagline} trailing={<ModuleProgress module={module} best={best} />} />
          ))}
        </List>
      ) : null}
    </>
  );
}
