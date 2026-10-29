import { useState } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { Lessons, StudentAssignment, StudentMaterial } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { openPdf } from "@/account/files";
import { Badge, formatDate, FormError, LINK_PRIMARY_CLASS, LoadState, TextAreaField } from "@/account/ui";
import { Button, EmptyState, PageTitle } from "@/design/components";

import { formatDueOn, ITEM_KIND_LABELS, todayIso } from "../professor/teaching";
import { isOverdue, pendingCount, safeExternalUrl, safePlayPath } from "./lessons";

const MAX_NOTE = 2000;

function ItemLine({ item }: { item: StudentAssignment["items"][number] }) {
  const playPath = safePlayPath(item.playPath);
  const details = [item.bpm ? `${item.bpm} BPM` : null, item.minutes ? `${item.minutes} min` : null, item.stars ? `meta ${item.stars} ★` : null].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-soft px-4 py-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="text-caption text-ink-muted">{ITEM_KIND_LABELS[item.kind]}</span>
        <span className="font-medium text-ink">{item.title}</span>
        {details ? <span className="text-caption text-ink-muted">{details}</span> : null}
        {item.note ? <span className="whitespace-pre-line text-body text-ink-muted">{item.note}</span> : null}
      </div>
      {playPath ? (
        <Link to={playPath} className={LINK_PRIMARY_CLASS}>
          Tocar
        </Link>
      ) : null}
    </li>
  );
}

function AttachedMaterial({ material }: { material: StudentMaterial }) {
  const [error, setError] = useState<string | null>(null);
  const url = safeExternalUrl(material.url);
  if (material.kind === "pdf" && material.fileId) {
    const fileId = material.fileId;
    return (
      <li className="grid gap-1">
        <button type="button" className="text-left font-medium text-primary underline-offset-4 hover:underline" onClick={() => openPdf(fileId).catch((cause: unknown) => setError(errorMessage(cause)))}>
          {material.title} (PDF)
        </button>
        <FormError message={error} />
      </li>
    );
  }
  if (material.kind === "link" && url) {
    return (
      <li>
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
          {material.title}
        </a>
      </li>
    );
  }
  return (
    <li className="grid gap-1">
      <span className="font-medium text-ink">{material.title}</span>
      {material.body ? <p className="whitespace-pre-line text-body text-ink-muted">{material.body}</p> : null}
    </li>
  );
}

function AssignmentCard({ assignment, materials, onChanged }: { assignment: StudentAssignment; materials: StudentMaterial[]; onChanged: () => void }) {
  const [note, setNote] = useState(assignment.studentNote);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = assignment.doneAt !== null;
  const attached = materials.filter((material) => assignment.materialIds.includes(material.id));
  const overdue = isOverdue(assignment, todayIso());

  async function save(nextDone: boolean) {
    setPending(true);
    setError(null);
    try {
      await api.put(`/me/assignments/${assignment.id}/status`, { done: nextDone, note: note.trim() });
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="grid gap-4 rounded-lg bg-surface p-5 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-heading font-semibold text-ink">{assignment.title}</h2>
          <p className="text-caption text-ink-muted">
            {assignment.teacherName}
            {assignment.className ? `, ${assignment.className}` : ""}. Prazo: {formatDueOn(assignment.dueOn)}
          </p>
        </div>
        {done ? <Badge tone="good">Feita</Badge> : overdue ? <Badge tone="bad">Atrasada</Badge> : <Badge tone="warn">Pendente</Badge>}
      </header>
      {assignment.instructions ? <p className="whitespace-pre-line text-body text-ink">{assignment.instructions}</p> : null}
      {assignment.items.length > 0 ? (
        <ul className="grid gap-2" aria-label="O que estudar">
          {assignment.items.map((item, index) => (
            <ItemLine key={`${item.ref ?? item.title}-${index}`} item={item} />
          ))}
        </ul>
      ) : null}
      {attached.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-caption font-medium text-ink-muted">Materiais</h3>
          <ul className="grid gap-2">
            {attached.map((material) => (
              <AttachedMaterial key={material.id} material={material} />
            ))}
          </ul>
        </div>
      ) : null}
      {assignment.feedback ? (
        <div className="rounded-md bg-primary-soft px-4 py-3">
          <p className="text-caption font-medium text-primary">Retorno do professor{assignment.feedbackAt ? `, ${formatDate(assignment.feedbackAt)}` : ""}</p>
          <p className="whitespace-pre-line text-body text-ink">{assignment.feedback}</p>
        </div>
      ) : null}
      <TextAreaField label="Recado para o professor (opcional)" maxLength={MAX_NOTE} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Como foi, onde travou, o que quer perguntar" />
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        {done ? (
          <>
            <Button variant="secondary" disabled={pending || note.trim() === assignment.studentNote} onClick={() => void save(true)}>
              Salvar recado
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => void save(false)}>
              Desmarcar como feita
            </Button>
          </>
        ) : (
          <Button variant="primary" disabled={pending} onClick={() => void save(true)}>
            {pending ? "Salvando…" : "Marcar como feita"}
          </Button>
        )}
      </div>
    </li>
  );
}

export function TarefasAlunoPage() {
  const lessons = useApiData((signal) => api.get<Lessons>("/me/lessons", signal), []);
  const [showDone, setShowDone] = useState(false);

  return (
    <div className="grid gap-6">
      <PageTitle title="Tarefas" eyebrow="Minhas aulas" />
      <LoadState {...lessons}>
        {({ assignments, materials }) => {
          if (assignments.length === 0) {
            return (
              <EmptyState
                title="Nenhuma tarefa por enquanto"
                description="Quando seu professor passar uma tarefa, ela aparece aqui. Ainda não está numa turma? Entre com o código que ele te passou."
                action={
                  <Link to="/aulas/turmas" className={LINK_PRIMARY_CLASS}>
                    Entrar numa turma
                  </Link>
                }
              />
            );
          }
          const open = assignments.filter((assignment) => assignment.doneAt === null);
          const done = assignments.filter((assignment) => assignment.doneAt !== null);
          return (
            <div className="grid gap-4">
              <p className="text-body text-ink-muted">{pendingCount(assignments) === 0 ? "Tudo em dia." : `${pendingCount(assignments)} para fazer.`}</p>
              <ul className="grid gap-4">
                {open.map((assignment) => (
                  <AssignmentCard key={`${assignment.id}-${assignment.doneAt}`} assignment={assignment} materials={materials} onChanged={lessons.reload} />
                ))}
              </ul>
              {done.length > 0 ? (
                <div className="grid gap-4">
                  <Button variant="ghost" className="justify-self-start" onClick={() => setShowDone((value) => !value)}>
                    {showDone ? "Esconder as feitas" : `Ver as feitas (${done.length})`}
                  </Button>
                  {showDone ? (
                    <ul className="grid gap-4">
                      {done.map((assignment) => (
                        <AssignmentCard key={`${assignment.id}-${assignment.doneAt}`} assignment={assignment} materials={materials} onChanged={lessons.reload} />
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        }}
      </LoadState>
    </div>
  );
}
