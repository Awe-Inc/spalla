import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { PlanBlock, TeacherPlan } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { FIELD_CLASS, FormError, formatDate, LINK_PRIMARY_CLASS, LINK_SECONDARY_CLASS, LoadState, TextAreaField, TextField } from "@/account/ui";
import type { BlockKind } from "@/data/db";
import {
  addBlock,
  BLOCK_LABELS,
  GOAL_LABELS,
  GOAL_ORDER,
  GOAL_VALUE_RANGE,
  hasRepeatedNeighbours,
  MAX_BLOCK_MINUTES,
  removeBlock,
  ROUTINE_ORDER,
  setBlockGoal,
  setBlockMinutes,
  totalMinutes,
  type RoutineGoal,
} from "@/data/routines";
import { Button, Card, EmptyState, PageTitle } from "@/design/components";

import { AudienceSelect, ItemPicker, ReorderButtons } from "./pickers";
import { audienceFromChoice, audienceLabel, blockFromTeachable, MAX_ITEMS, moveItem, replaceAt, type AudienceChoice } from "./teaching";

const PLAN_BLOCK_TYPES: readonly BlockKind[] = [...ROUTINE_ORDER, "estudo", "livre"];

function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function withVariation(block: PlanBlock, variation: string): PlanBlock {
  const { variation: _removed, ...rest } = block;
  return variation === "" ? rest : { ...rest, variation };
}

function withoutItem(block: PlanBlock): PlanBlock {
  const { itemTitle: _title, itemPath: _path, ...rest } = block;
  return { ...rest, itemId: "" };
}

function BlockEditor({ block, index, count, onChange, onMove, onRemove }: { block: PlanBlock; index: number; count: number; onChange: (block: PlanBlock) => void; onMove: (delta: -1 | 1) => void; onRemove: () => void }) {
  const [picking, setPicking] = useState(false);
  const label = BLOCK_LABELS[block.type];
  const valueRange = GOAL_VALUE_RANGE[block.goal];

  return (
    <li className="grid gap-3 rounded-md border border-hairline p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-body font-semibold text-ink">
          <span className="mr-2 font-mono text-caption text-ink-subtle tabular">{index + 1}</span>
          {label}
        </p>
        <ReorderButtons index={index} count={count} onMove={onMove} onRemove={onRemove} label={label} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-caption text-ink-muted">
          Minutos
          <input
            type="number"
            min={1}
            max={MAX_BLOCK_MINUTES}
            inputMode="numeric"
            className={FIELD_CLASS}
            value={block.durationMinutes}
            onChange={(event) => onChange(setBlockMinutes([block], 0, Number(event.target.value))[0]! as PlanBlock)}
          />
        </label>
        <label className="grid gap-1 text-caption text-ink-muted">
          Meta
          <select className={FIELD_CLASS} value={block.goal} onChange={(event) => onChange(setBlockGoal([block], 0, event.target.value as RoutineGoal)[0]! as PlanBlock)}>
            {GOAL_ORDER.map((goal) => (
              <option key={goal} value={goal}>
                {GOAL_LABELS[goal]}
              </option>
            ))}
          </select>
        </label>
        {valueRange ? (
          <label className="grid gap-1 text-caption text-ink-muted">
            Quantidade
            <select className={FIELD_CLASS} value={block.goalValue} onChange={(event) => onChange(setBlockGoal([block], 0, block.goal, Number(event.target.value))[0]! as PlanBlock)}>
              {range(valueRange.min, valueRange.max).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <label className="grid gap-1 text-caption text-ink-muted">
        Como fazer (opcional)
        <input className={FIELD_CLASS} maxLength={200} placeholder="Ex.: arco inteiro, devagar, com bordão" value={block.variation ?? ""} onChange={(event) => onChange(withVariation(block, event.target.value))} />
      </label>
      {block.itemTitle ? (
        <div className="flex flex-wrap items-center gap-2 text-body">
          <span className="text-ink-muted">Fixo:</span>
          <span className="font-medium text-ink">{block.itemTitle}</span>
          <button type="button" className="text-caption text-ink-muted hover:text-ink" onClick={() => onChange(withoutItem(block))}>
            Soltar
          </button>
        </div>
      ) : picking ? (
        <ItemPicker
          onPick={(item) => {
            onChange({ ...blockFromTeachable(item, block.type, block.durationMinutes), goal: block.goal, goalValue: block.goalValue, ...(block.variation ? { variation: block.variation } : {}) });
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <div>
          <button type="button" className="text-caption text-primary underline-offset-4 hover:underline" onClick={() => setPicking(true)}>
            Fixar um exercício ou peça neste bloco
          </button>
          <p className="text-caption text-ink-subtle">Sem item fixo, o app escolhe um exercício do tipo certo para o nível do aluno.</p>
        </div>
      )}
    </li>
  );
}

interface PlanDraft {
  audience: AudienceChoice;
  name: string;
  description: string;
  blocks: PlanBlock[];
}

function PlanForm({ initial, existing }: { initial: PlanDraft; existing: TeacherPlan | null }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initial);
  const [newType, setNewType] = useState<BlockKind>("escalas");
  const [errors, setErrors] = useState<{ audience?: string; name?: string; blocks?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const total = totalMinutes(draft.blocks);
  const full = draft.blocks.length >= MAX_ITEMS;

  function patch(changes: Partial<PlanDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: typeof errors = {};
    if (!existing && !audienceFromChoice(draft.audience)) found.audience = "Escolha uma turma ou um aluno.";
    if (draft.name.trim().length < 2) found.name = "Dê um nome com pelo menos 2 letras.";
    if (draft.blocks.length === 0) found.blocks = "Coloque pelo menos um bloco.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    setFormError(null);
    const fields = { name: draft.name.trim(), description: draft.description.trim(), blocks: draft.blocks };
    try {
      if (existing) await api.patch(`/teacher/plans/${existing.id}`, fields);
      else await api.post("/teacher/plans", { ...fields, ...audienceFromChoice(draft.audience) });
      navigate("/professor/planos");
    } catch (cause) {
      setFormError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card title="Plano" className="self-start">
        <div className="grid gap-4">
          {existing ? null : <AudienceSelect value={draft.audience} onChange={(audience) => patch({ audience })} error={errors.audience} />}
          <TextField label="Nome" maxLength={120} placeholder="Ex.: Rotina da semana — Livro 1" value={draft.name} error={errors.name} onChange={(event) => patch({ name: event.target.value })} />
          <TextAreaField label="Para o aluno ler antes" maxLength={2000} value={draft.description} onChange={(event) => patch({ description: event.target.value })} />
          <p className="text-body text-ink">
            Total: <span className="font-semibold tabular">{total} min</span> por dia
          </p>
          <FormError message={formError} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {existing ? "Salvar plano" : "Criar plano"}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/professor/planos")}>
              Cancelar
            </Button>
          </div>
        </div>
      </Card>
      <Card title="Blocos do dia">
        <div className="grid gap-4">
          <p className="text-caption text-ink-muted">O aluno adota o plano como rotina no Praticar. Cada bloco tem minutos e uma meta que o fecha.</p>
          <ol className="grid gap-3">
            {draft.blocks.map((block, index) => (
              <BlockEditor
                key={`${index}-${block.type}-${block.itemId}`}
                block={block}
                index={index}
                count={draft.blocks.length}
                onChange={(next) => patch({ blocks: replaceAt(draft.blocks, index, next) })}
                onMove={(delta) => patch({ blocks: moveItem(draft.blocks, index, delta) })}
                onRemove={() => patch({ blocks: removeBlock(draft.blocks, index) as PlanBlock[] })}
              />
            ))}
          </ol>
          {hasRepeatedNeighbours(draft.blocks) ? <p className="text-caption text-close">Dois blocos iguais seguidos: separe com outro tipo para o dia não ficar monótono.</p> : null}
          {errors.blocks ? (
            <p className="text-caption text-off" role="alert">
              {errors.blocks}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${FIELD_CLASS} w-auto`} aria-label="Tipo do bloco novo" value={newType} onChange={(event) => setNewType(event.target.value as BlockKind)}>
              {PLAN_BLOCK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {BLOCK_LABELS[type]}
                </option>
              ))}
            </select>
            <Button disabled={full} onClick={() => patch({ blocks: addBlock(draft.blocks, newType) as PlanBlock[] })}>
              Adicionar bloco
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

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
      <PageTitle title="Novo plano de estudo" eyebrow="Planos" />
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
            <PageTitle title="Editar plano" eyebrow={audienceLabel(plan.className, plan.studentName)} />
            <PlanForm existing={plan} initial={{ audience: "", name: plan.name, description: plan.description, blocks: plan.blocks }} />
          </div>
        ) : (
          <EmptyState title="Plano não encontrado" description="Ele pode ter sido apagado." action={<Link to="/professor/planos" className={LINK_PRIMARY_CLASS}>Voltar aos planos</Link>} />
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
          <Link to={`/professor/planos/${plan.id}/editar`} className={LINK_SECONDARY_CLASS}>
            Editar
          </Link>
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
      <PageTitle title="Planos de estudo" eyebrow="Área do professor">
        <Link to="/professor/planos/novo" className={LINK_PRIMARY_CLASS}>
          Novo plano
        </Link>
      </PageTitle>
      <LoadState {...plans}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title="Nenhum plano ainda"
              description="Um plano é a rotina diária que você monta para a turma ou para um aluno: blocos de aquecimento, escalas, peça e revisão, com minutos e metas. O aluno adota com um toque."
              action={
                <Link to="/professor/planos/novo" className={LINK_PRIMARY_CLASS}>
                  Montar o primeiro plano
                </Link>
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
