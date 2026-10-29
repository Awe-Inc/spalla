import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link } from "react-router";

import { adoptPlan, planBlocksToRoutine } from "@/account/adoptPlan";
import { api, errorMessage } from "@/api/client";
import type { Lessons, StudentPlan } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { formatDate, FormError, LINK_PRIMARY_CLASS, LoadState } from "@/account/ui";
import { useSettings } from "@/app/settings";
import { db } from "@/data/db";
import { BLOCK_LABELS, totalMinutes } from "@/data/routines";
import { Button, EmptyState, PageTitle } from "@/design/components";

import { GOAL_TEXT } from "../professor/teaching";

function PlanCard({ plan, adoptedRoutineId }: { plan: StudentPlan; adoptedRoutineId: number | null }) {
  const routineId = useSettings((state) => state.routineId);
  const setRoutine = useSettings((state) => state.setRoutine);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isActive = adoptedRoutineId !== null && adoptedRoutineId === routineId;
  const minutes = totalMinutes(planBlocksToRoutine(plan.blocks));

  async function adopt() {
    setPending(true);
    setError(null);
    try {
      setRoutine(await adoptPlan(plan));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="grid gap-4 rounded-lg bg-surface p-5 shadow-card">
      <header className="grid gap-1">
        <h2 className="text-heading font-semibold text-ink">{plan.name}</h2>
        <p className="text-caption text-ink-muted">
          {plan.teacherName}
          {plan.className ? `, ${plan.className}` : ""}. {minutes} min por dia. Atualizado em {formatDate(plan.updatedAt)}
        </p>
      </header>
      {plan.description ? <p className="whitespace-pre-line text-body text-ink">{plan.description}</p> : null}
      <ol className="grid gap-2">
        {plan.blocks.map((block, index) => (
          <li key={`${block.type}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-surface-soft px-4 py-2.5">
            <span className="font-medium text-ink">
              {BLOCK_LABELS[block.type]}
              {block.itemTitle ? `: ${block.itemTitle}` : ""}
            </span>
            <span className="text-caption text-ink-muted tabular">
              {block.durationMinutes} min, {block.goal === "tempo" || block.goal === "uma-vez" ? GOAL_TEXT[block.goal] : `${block.goalValue} ${GOAL_TEXT[block.goal]}`}
            </span>
          </li>
        ))}
      </ol>
      <FormError message={error} />
      <div className="flex flex-wrap items-center gap-2">
        {isActive ? (
          <>
            <span className="text-body font-medium text-in-tune">É a sua rotina agora.</span>
            <Link to="/estudar" className={LINK_PRIMARY_CLASS}>
              Praticar
            </Link>
            <Button variant="ghost" disabled={pending} onClick={() => void adopt()}>
              Atualizar com a versão do professor
            </Button>
          </>
        ) : (
          <Button variant="primary" disabled={pending} onClick={() => void adopt()}>
            {pending ? "Guardando…" : "Usar como minha rotina"}
          </Button>
        )}
      </div>
    </li>
  );
}

export function PlanosAlunoPage() {
  const lessons = useApiData((signal) => api.get<Lessons>("/me/lessons", signal), []);
  const adopted = useLiveQuery(async () => {
    const routines = await db.routines.where("origin").equals("professor").toArray();
    return new Map(routines.flatMap((routine) => (routine.teacherPlanId && routine.id !== undefined ? [[routine.teacherPlanId, routine.id] as const] : [])));
  }, []);

  return (
    <div className="grid gap-6">
      <PageTitle title="Planos de estudo" eyebrow="Minhas aulas">
        <p className="max-w-prose text-body text-ink-muted">O plano do professor vira a sua rotina em Praticar, e funciona sem internet.</p>
      </PageTitle>
      <LoadState {...lessons}>
        {({ plans }) =>
          plans.length === 0 ? (
            <EmptyState title="Nenhum plano ainda" description="Quando o professor montar um plano de estudo para você ou para a sua turma, ele aparece aqui." />
          ) : (
            <ul className="grid gap-4">
              {plans.map((plan) => (
                <PlanCard key={`${plan.id}-${plan.updatedAt}`} plan={plan} adoptedRoutineId={adopted?.get(plan.id) ?? null} />
              ))}
            </ul>
          )
        }
      </LoadState>
    </div>
  );
}
