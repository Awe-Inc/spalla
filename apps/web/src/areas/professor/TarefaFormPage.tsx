import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { api, ApiError, errorMessage } from "@/api/client";
import type { AssignmentItem, TeacherAssignmentDetail, TeacherMaterial } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { FormError, LoadState } from "@/account/ui";
import { FIELD_CLASS, TextAreaField, TextField } from "@/design/fields";
import { Button, Card, PageHeader } from "@/design/components";

import { AudienceSelect, ItemPicker, ReorderButtons } from "./pickers";
import { audienceFromChoice, ITEM_KIND_LABELS, itemFromTeachable, MATERIAL_KIND_LABELS, MAX_ITEMS, moveItem, removeAt, replaceAt, textItem, type AudienceChoice } from "./teaching";

interface AssignmentDraft {
  audience: AudienceChoice;
  title: string;
  instructions: string;
  dueOn: string;
  items: AssignmentItem[];
  materialIds: string[];
}

type DraftErrors = Partial<Record<"audience" | "title" | "dueOn" | "items", string>>;

function validateDraft(draft: AssignmentDraft, isNew: boolean): DraftErrors {
  const errors: DraftErrors = {};
  if (isNew && !audienceFromChoice(draft.audience)) errors.audience = "Escolha uma turma ou um aluno.";
  if (draft.title.trim().length < 2) errors.title = "Dê um título com pelo menos 2 letras.";
  if (draft.items.length === 0 && draft.instructions.trim() === "") errors.items = "Coloque pelo menos um item ou escreva as instruções.";
  return errors;
}

function optionalNumber(value: string, min: number, max: number): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

function withNumber(item: AssignmentItem, key: "bpm" | "minutes" | "stars", value: number | undefined): AssignmentItem {
  const { [key]: _removed, ...rest } = item;
  return value === undefined ? rest : { ...rest, [key]: value };
}

function withNote(item: AssignmentItem, note: string): AssignmentItem {
  const { note: _removed, ...rest } = item;
  return note === "" ? rest : { ...rest, note };
}

function ItemEditor({ item, index, count, onChange, onMove, onRemove }: { item: AssignmentItem; index: number; count: number; onChange: (item: AssignmentItem) => void; onMove: (delta: -1 | 1) => void; onRemove: () => void }) {
  const playable = item.kind !== "texto";
  return (
    <li className="grid gap-3 rounded-md border border-hairline p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-ink-muted">{ITEM_KIND_LABELS[item.kind]}</p>
          {playable ? (
            <p className="truncate text-body font-medium text-ink">{item.title}</p>
          ) : (
            <input aria-label="Orientação" className={`${FIELD_CLASS} mt-1`} maxLength={120} value={item.title} onChange={(event) => onChange({ ...item, title: event.target.value })} />
          )}
        </div>
        <ReorderButtons index={index} count={count} onMove={onMove} onRemove={onRemove} label={item.title || "item"} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {playable ? (
          <label className="grid gap-1 text-caption text-ink-muted">
            BPM alvo
            <input type="number" min={20} max={240} inputMode="numeric" className={FIELD_CLASS} value={item.bpm ?? ""} onChange={(event) => onChange(withNumber(item, "bpm", optionalNumber(event.target.value, 20, 240)))} />
          </label>
        ) : null}
        <label className="grid gap-1 text-caption text-ink-muted">
          Minutos por dia
          <input type="number" min={1} max={120} inputMode="numeric" className={FIELD_CLASS} value={item.minutes ?? ""} onChange={(event) => onChange(withNumber(item, "minutes", optionalNumber(event.target.value, 1, 120)))} />
        </label>
        {playable ? (
          <label className="grid gap-1 text-caption text-ink-muted">
            Estrelas esperadas
            <select className={FIELD_CLASS} value={item.stars ?? ""} onChange={(event) => onChange(withNumber(item, "stars", optionalNumber(event.target.value, 1, 3)))}>
              <option value="">Sem meta</option>
              <option value="1">1 estrela</option>
              <option value="2">2 estrelas</option>
              <option value="3">3 estrelas</option>
            </select>
          </label>
        ) : null}
      </div>
      <label className="grid gap-1 text-caption text-ink-muted">
        Observação para o aluno
        <input className={FIELD_CLASS} maxLength={500} value={item.note ?? ""} onChange={(event) => onChange(withNote(item, event.target.value))} />
      </label>
    </li>
  );
}

function ItemsCard({ items, onChange, error }: { items: AssignmentItem[]; onChange: (items: AssignmentItem[]) => void; error: string | undefined }) {
  const [picking, setPicking] = useState(false);
  const full = items.length >= MAX_ITEMS;
  return (
    <Card title="O que estudar">
      <div className="grid gap-4">
        {items.length > 0 ? (
          <ol className="grid gap-3">
            {items.map((item, index) => (
              <ItemEditor
                key={`${index}-${item.ref ?? item.kind}`}
                item={item}
                index={index}
                count={items.length}
                onChange={(next) => onChange(replaceAt(items, index, next))}
                onMove={(delta) => onChange(moveItem(items, index, delta))}
                onRemove={() => onChange(removeAt(items, index))}
              />
            ))}
          </ol>
        ) : (
          <p className="text-body text-ink-muted">Escolha exercícios do currículo, peças da biblioteca ou escreva uma orientação livre.</p>
        )}
        {picking ? (
          <ItemPicker
            onPick={(item) => {
              onChange([...items, itemFromTeachable(item)]);
              setPicking(false);
            }}
            onCancel={() => setPicking(false)}
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={full || picking} onClick={() => setPicking(true)}>
            Adicionar exercício ou peça
          </Button>
          <Button disabled={full} onClick={() => onChange([...items, textItem("Orientação")])}>
            Adicionar orientação
          </Button>
        </div>
        {full ? <p className="text-caption text-ink-muted">Limite de {MAX_ITEMS} itens por tarefa.</p> : null}
        {error ? (
          <p className="text-caption text-off" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function MaterialsCard({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const materials = useApiData((signal) => api.get<TeacherMaterial[]>("/teacher/materials", signal), []);
  return (
    <Card title="Materiais anexados">
      <LoadState {...materials}>
        {(list) =>
          list.length === 0 ? (
            <p className="text-body text-ink-muted">
              Nenhum material ainda. <Link to="/professor/materiais" className="text-primary underline-offset-4 hover:underline">Envie um PDF ou link</Link> e volte aqui.
            </p>
          ) : (
            <ul className="grid gap-2">
              {list.map((material) => (
                <li key={material.id}>
                  <label className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-surface-soft">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={selected.includes(material.id)}
                      onChange={(event) => onChange(event.target.checked ? [...selected, material.id] : selected.filter((id) => id !== material.id))}
                    />
                    <span className="text-body text-ink">{material.title}</span>
                    <span className="text-caption text-ink-muted">{MATERIAL_KIND_LABELS[material.kind]}</span>
                  </label>
                </li>
              ))}
            </ul>
          )
        }
      </LoadState>
    </Card>
  );
}

function AssignmentForm({ initial, existing }: { initial: AssignmentDraft; existing: TeacherAssignmentDetail | null }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function patch(changes: Partial<AssignmentDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateDraft(draft, existing === null);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    setFormError(null);
    const fields = {
      title: draft.title.trim(),
      instructions: draft.instructions.trim(),
      dueOn: draft.dueOn === "" ? null : draft.dueOn,
      items: draft.items.map((item) => (item.kind === "texto" ? { ...item, title: item.title.trim() || "Orientação" } : item)),
      materialIds: draft.materialIds,
    };
    try {
      if (existing) {
        await api.patch(`/teacher/assignments/${existing.id}`, fields);
        navigate(`/professor/tarefas/${existing.id}`);
      } else {
        const created = await api.post<{ id: string }>("/teacher/assignments", { ...fields, ...audienceFromChoice(draft.audience) });
        navigate(`/professor/tarefas/${created.id}`);
      }
    } catch (cause) {
      setFormError(errorMessage(cause));
      if (cause instanceof ApiError && cause.fields) setErrors(cause.fields as DraftErrors);
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-6">
        <Card title="Tarefa">
          <div className="grid gap-4">
            {existing ? null : <AudienceSelect value={draft.audience} onChange={(audience) => patch({ audience })} error={errors.audience} />}
            <TextField label="Título" maxLength={120} placeholder="Ex.: Semana 3 — Lá maior e Minueto 1" value={draft.title} error={errors.title} onChange={(event) => patch({ title: event.target.value })} />
            <TextAreaField label="Instruções" maxLength={4000} hint="Como estudar, o que observar, quantas vezes por dia." value={draft.instructions} onChange={(event) => patch({ instructions: event.target.value })} />
            <TextField label="Entregar até (opcional)" type="date" value={draft.dueOn} error={errors.dueOn} onChange={(event) => patch({ dueOn: event.target.value })} />
          </div>
        </Card>
        <ItemsCard items={draft.items} onChange={(items) => patch({ items })} error={errors.items} />
      </div>
      <div className="grid content-start gap-6">
        <MaterialsCard selected={draft.materialIds} onChange={(materialIds) => patch({ materialIds })} />
        <FormError message={formError} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {existing ? "Salvar tarefa" : "Passar tarefa"}
          </Button>
          <Button variant="ghost" onClick={() => navigate(existing ? `/professor/tarefas/${existing.id}` : "/professor/tarefas")}>
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  );
}

function initialAudience(params: URLSearchParams): AudienceChoice {
  const classId = params.get("turma");
  if (classId) return `turma:${classId}`;
  const studentId = params.get("aluno");
  if (studentId) return `aluno:${studentId}`;
  return "";
}

export function NovaTarefaPage() {
  const [params] = useSearchParams();
  const initial: AssignmentDraft = { audience: initialAudience(params), title: "", instructions: "", dueOn: "", items: [], materialIds: [] };
  return (
    <div className="grid gap-6">
      <PageHeader title="Nova tarefa" back={{ to: "/professor/tarefas", label: "Tarefas" }} />
      <AssignmentForm initial={initial} existing={null} />
    </div>
  );
}

export function EditarTarefaPage() {
  const { assignmentId = "" } = useParams();
  const detail = useApiData((signal) => api.get<TeacherAssignmentDetail>(`/teacher/assignments/${assignmentId}`, signal), [assignmentId]);
  return (
    <LoadState {...detail}>
      {(assignment) => (
        <div className="grid gap-6">
          <PageHeader title="Editar tarefa" back={{ to: `/professor/tarefas/${assignment.id}`, label: assignment.title }} />
          <AssignmentForm
            existing={assignment}
            initial={{ audience: "", title: assignment.title, instructions: assignment.instructions, dueOn: assignment.dueOn ?? "", items: assignment.items, materialIds: assignment.materialIds }}
          />
        </div>
      )}
    </LoadState>
  );
}
