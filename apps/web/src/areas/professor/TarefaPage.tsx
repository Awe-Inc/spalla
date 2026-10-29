import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { AssignmentRecipient, TeacherAssignmentDetail } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { AREA_CLASS, Badge, FormError, formatDate, formatDateTime, LINK_SECONDARY_CLASS, LoadState } from "@/account/ui";
import { Button, Card, PageTitle } from "@/design/components";

import { formatDueOn, ITEM_KIND_LABELS } from "./teaching";

function FeedbackRow({ assignmentId, recipient, onSaved }: { assignmentId: string; recipient: AssignmentRecipient; onSaved: () => void }) {
  const [feedback, setFeedback] = useState(recipient.feedback);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const changed = feedback.trim() !== recipient.feedback;

  async function save() {
    setPending(true);
    setError(null);
    try {
      await api.put(`/teacher/assignments/${assignmentId}/students/${recipient.id}/feedback`, { feedback: feedback.trim() });
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="grid gap-3 border-b border-hairline py-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/professor/alunos/${recipient.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {recipient.name}
        </Link>
        {recipient.doneAt ? <Badge tone="good">Feita em {formatDate(recipient.doneAt)}</Badge> : <Badge>Pendente</Badge>}
      </div>
      {recipient.studentNote ? (
        <blockquote className="rounded-md bg-surface-soft p-3 text-body text-ink">
          <span className="block text-caption text-ink-muted">Nota do aluno</span>
          {recipient.studentNote}
        </blockquote>
      ) : null}
      <label className="grid gap-1 text-caption text-ink-muted">
        Seu retorno
        <textarea className={`${AREA_CLASS} min-h-20`} maxLength={4000} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!changed || pending} onClick={save}>
          Enviar retorno
        </Button>
        {recipient.feedbackAt ? <span className="text-caption text-ink-muted">Último retorno em {formatDateTime(recipient.feedbackAt)}</span> : null}
      </div>
      <FormError message={error} />
    </li>
  );
}

function DeleteAssignment({ id }: { id: string }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    try {
      await api.delete(`/teacher/assignments/${id}`);
      navigate("/professor/tarefas");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="grid gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body text-ink">Apagar a tarefa e os retornos?</span>
          <Button variant="ghost" onClick={remove}>
            Apagar
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Manter
          </Button>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          Apagar tarefa
        </Button>
      )}
      <FormError message={error} />
    </div>
  );
}

export function TarefaPage() {
  const { assignmentId = "" } = useParams();
  const detail = useApiData((signal) => api.get<TeacherAssignmentDetail>(`/teacher/assignments/${assignmentId}`, signal), [assignmentId]);

  return (
    <LoadState {...detail}>
      {(assignment) => {
        const done = assignment.students.filter((student) => student.doneAt).length;
        return (
          <div className="grid gap-6">
            <PageTitle title={assignment.title} eyebrow="Tarefa">
              <Link to={`/professor/tarefas/${assignment.id}/editar`} className={LINK_SECONDARY_CLASS}>
                Editar
              </Link>
            </PageTitle>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="grid content-start gap-6">
                <Card title="Resumo">
                  <dl className="grid grid-cols-2 gap-4 text-body">
                    <div>
                      <dt className="text-caption text-ink-muted">Entrega</dt>
                      <dd>{formatDueOn(assignment.dueOn)}</dd>
                    </div>
                    <div>
                      <dt className="text-caption text-ink-muted">Feitas</dt>
                      <dd className="tabular">
                        {done} de {assignment.students.length}
                      </dd>
                    </div>
                  </dl>
                  {assignment.instructions ? <p className="mt-4 whitespace-pre-line text-body text-ink">{assignment.instructions}</p> : null}
                </Card>
                <Card title="Itens">
                  {assignment.items.length === 0 ? (
                    <p className="text-body text-ink-muted">Só instruções, sem itens.</p>
                  ) : (
                    <ol className="grid gap-3">
                      {assignment.items.map((item, index) => (
                        <li key={`${index}-${item.title}`} className="grid gap-1">
                          <span className="text-caption text-ink-muted">{ITEM_KIND_LABELS[item.kind]}</span>
                          <span className="font-medium text-ink">{item.title}</span>
                          <span className="text-caption text-ink-muted">
                            {[item.bpm ? `${item.bpm} BPM` : null, item.minutes ? `${item.minutes} min/dia` : null, item.stars ? `meta ${item.stars}★` : null].filter(Boolean).join(" · ")}
                          </span>
                          {item.note ? <span className="text-body text-ink-muted">{item.note}</span> : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
                <DeleteAssignment id={assignment.id} />
              </div>
              <Card title="Alunos e retornos">
                {assignment.students.length === 0 ? (
                  <p className="text-body text-ink-muted">Nenhum aluno recebe esta tarefa ainda.</p>
                ) : (
                  <ul>
                    {assignment.students.map((recipient) => (
                      <FeedbackRow key={`${recipient.id}-${recipient.feedbackAt ?? ""}`} assignmentId={assignment.id} recipient={recipient} onSaved={detail.reload} />
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        );
      }}
    </LoadState>
  );
}
