import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { PlanBlock, TeacherPlan } from "@/api/types";
import { FormError } from "@/account/ui";
import { FIELD_CLASS, TextAreaField, TextField } from "@/design/fields";
import type { BlockKind } from "@/data/db";
import { addBlock, BLOCK_LABELS, hasRepeatedNeighbours, removeBlock, ROUTINE_ORDER, totalMinutes } from "@/data/routines";
import { Button, Card } from "@/design/components";

import { BlockEditor } from "./PlanBlockEditor";
import { AudienceSelect } from "./pickers";
import { audienceFromChoice, MAX_ITEMS, moveItem, replaceAt, type AudienceChoice } from "./teaching";

const PLAN_BLOCK_TYPES: readonly BlockKind[] = [...ROUTINE_ORDER, "estudo", "livre"];

export interface PlanDraft {
  audience: AudienceChoice;
  name: string;
  description: string;
  blocks: PlanBlock[];
}

export function PlanForm({ initial, existing }: { initial: PlanDraft; existing: TeacherPlan | null }) {
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
