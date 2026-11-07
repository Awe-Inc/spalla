import { useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { PlanBlock, TeacherPlan } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { FormError, formatDate, LoadState } from "@/account/ui";
import { BLOCK_LABELS, totalMinutes } from "@/data/routines";
import { Button, ButtonLink, EmptyState, PageHeader } from "@/design/components";

import { PlanForm } from "./PlanForm";
import { audienceLabel, blockFromTeachable, type AudienceChoice } from "./teaching";

function initialAudience(params: URLSearchParams): AudienceChoice {
  const classId = params.get("turma");
  if (classId) return `turma:${classId}`;
  const studentId = params.get("aluno");
  return studentId ? `aluno:${studentId}` : "";
}

const STARTER_BLOCKS: PlanBlock[] = [blockFromTeachable(null, "aquecimento", 5), blockFromTeachable(null, "escalas", 5), blockFromTeachable(null, "peca-nova", 10), blockFromTeachable(null, "revisao", 5)];

export function NovoPlanoPage() {
  const [params] = useSearchParams();
  return (
    <div className="grid gap-6">
      <PageHeader title="Novo plano de estudo" back={{ to: "/professor/planos", label: "Planos de estudo" }} />
      <PlanForm existing={null} initial={{ audience: initialAudience(params), name: "", description: "", blocks: STARTER_BLOCKS }} />
    </div>
  );
}

export function EditarPlanoPage() {
  const { planId = "" } = useParams();
  const plans = useApiData((signal) => api.get<TeacherPlan[]>("/teacher/plans", signal), []);
  const plan = plans.data?.find((candidate) => candidate.id === planId);
  return (
    <LoadState {...plans}>
      {() =>
        plan ? (
          <div className="grid gap-6">
            <PageHeader title="Editar plano" description={audienceLabel(plan.className, plan.studentName)} />
            <PlanForm existing={plan} initial={{ audience: "", name: plan.name, description: plan.description, blocks: plan.blocks }} />
          </div>
        ) : (
          <EmptyState title="Plano não encontrado" description="Ele pode ter sido apagado." action={<ButtonLink to="/professor/planos" variant="primary">Voltar aos planos</ButtonLink>} />
        )
      }
    </LoadState>
  );
}

function PlanRow({ plan, onChanged }: { plan: TeacherPlan; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    try {
      await api.delete(`/teacher/plans/${plan.id}`);
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <li className="grid gap-3 rounded-lg bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-heading font-semibold text-ink">{plan.name}</h2>
          <p className="text-caption text-ink-muted">
            {audienceLabel(plan.className, plan.studentName)} · {totalMinutes(plan.blocks)} min · {plan.blocks.length} blocos · atualizado em {formatDate(plan.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/professor/planos/${plan.id}/editar`} variant="secondary">
            Editar
          </ButtonLink>
          {confirming ? (
            <>
              <Button variant="ghost" onClick={remove}>
                Apagar
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Manter
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Apagar
            </Button>
          )}
        </div>
      </div>
      <ol className="flex flex-wrap gap-2" aria-label="Blocos">
        {plan.blocks.map((block, index) => (
          <li key={`${index}-${block.type}`} className="rounded-pill bg-surface-soft px-3 py-1 text-caption text-ink">
            {block.itemTitle ?? BLOCK_LABELS[block.type]} · {block.durationMinutes} min
          </li>
        ))}
      </ol>
      <FormError message={error} />
    </li>
  );
}

export function PlanosPage() {
  const plans = useApiData((signal) => api.get<TeacherPlan[]>("/teacher/plans", signal), []);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Planos de estudo"
        actions={
          <>
            <ButtonLink to="/professor/planos/novo" variant="primary">
              Novo plano
            </ButtonLink>
          </>
        }
      />
      <LoadState {...plans}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title="Nenhum plano ainda"
              description="Um plano é a rotina diária que você monta para a turma ou para um aluno: blocos de aquecimento, escalas, peça e revisão, com minutos e metas. O aluno adota com um toque."
              action={
                <ButtonLink to="/professor/planos/novo" variant="primary">
                  Montar o primeiro plano
                </ButtonLink>
              }
            />
          ) : (
            <ul className="grid gap-3">
              {list.map((plan) => (
                <PlanRow key={plan.id} plan={plan} onChanged={plans.reload} />
              ))}
            </ul>
          )
        }
      </LoadState>
    </div>
  );
}
