import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { TeacherClassDetail } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { signupLink } from "@/account/links";
import { FormError, formatDate, formatDateTime, LoadState, Notice } from "@/account/ui";
import { Badge, TextAreaField, TextField } from "@/design/fields";
import { Button, ButtonLink, Card, PageHeader } from "@/design/components";

function inviteLink(code: string): string {
  return signupLink({ turma: code });
}

function CodeCard({ klass, onChanged }: { klass: TeacherClassDetail; onChanged: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copy(text: string, done: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setMessage(done);
    } catch {
      setError("Não deu para copiar. Selecione o texto e copie à mão.");
    }
  }

  async function regenerate() {
    setError(null);
    setMessage(null);
    try {
      await api.post(`/teacher/classes/${klass.id}/code`);
      setMessage("Código novo gerado. O antigo parou de funcionar.");
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card title="Código da turma">
      <div className="grid gap-4">
        <p className="font-mono text-display tracking-[0.2em] text-ink" aria-label={`Código ${klass.joinCode.split("").join(" ")}`}>
          {klass.joinCode}
        </p>
        <p className="text-body text-ink-muted">O aluno digita esse código ao criar a conta ou em Minhas aulas. O link já leva o código preenchido.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => copy(klass.joinCode, "Código copiado.")}>Copiar código</Button>
          <Button onClick={() => copy(inviteLink(klass.joinCode), "Link de convite copiado.")}>Copiar link</Button>
          <Button variant="ghost" onClick={regenerate}>
            Gerar código novo
          </Button>
        </div>
        {message ? <Notice>{message}</Notice> : null}
        <FormError message={error} />
      </div>
    </Card>
  );
}

function AnnouncementsCard({ klass, onChanged }: { klass: TeacherClassDetail; onChanged: () => void }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post(`/teacher/classes/${klass.id}/announcements`, { body: body.trim() });
      setBody("");
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.delete(`/teacher/announcements/${id}`);
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card title="Avisos">
      <form onSubmit={submit} className="mb-4 grid gap-3">
        <TextAreaField label="Novo aviso para a turma" maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} />
        <div>
          <Button type="submit" variant="primary" disabled={pending || body.trim() === ""}>
            Publicar aviso
          </Button>
        </div>
      </form>
      <FormError message={error} />
      {klass.announcements.length === 0 ? (
        <p className="text-caption text-ink-muted">Nenhum aviso publicado.</p>
      ) : (
        <ul className="grid gap-3">
          {klass.announcements.map((announcement) => (
            <li key={announcement.id} className="rounded-md bg-surface-soft p-4">
              <p className="whitespace-pre-line text-body text-ink">{announcement.body}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-caption text-ink-muted">
                <span>{formatDateTime(announcement.createdAt)}</span>
                <button type="button" className="hover:text-off" onClick={() => remove(announcement.id)}>
                  Apagar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StudentsCard({ klass, onChanged }: { klass: TeacherClassDetail; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(studentId: string) {
    setError(null);
    try {
      await api.delete(`/teacher/classes/${klass.id}/students/${studentId}`);
      setRemoving(null);
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card title={`Alunos (${klass.students.length})`} className="lg:col-span-2">
      <FormError message={error} />
      {klass.students.length === 0 ? (
        <p className="text-body text-ink-muted">Ninguém entrou ainda. Passe o código ou o link para os alunos.</p>
      ) : (
        <div className="-mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[36rem] text-left text-body">
            <thead className="text-caption text-ink-muted">
              <tr className="border-b border-hairline">
                <th className="py-2 pr-4 font-medium">Aluno</th>
                <th className="py-2 pr-4 font-medium">Minutos (7 dias)</th>
                <th className="py-2 pr-4 font-medium">Última prática</th>
                <th className="py-2 pr-4 font-medium">Tarefas feitas</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {klass.students.map((student) => (
                <tr key={student.id} className="border-b border-hairline last:border-0">
                  <td className="py-3 pr-4">
                    <Link to={`/professor/alunos/${student.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {student.name}
                    </Link>
                    <p className="text-caption text-ink-muted">{student.email}</p>
                  </td>
                  <td className="py-3 pr-4 tabular">{student.minutesLast7Days}</td>
                  <td className="py-3 pr-4">{formatDate(student.lastPracticeAt)}</td>
                  <td className="py-3 pr-4 tabular">{student.assignmentsDone}</td>
                  <td className="py-3 text-right">
                    {removing === student.id ? (
                      <span className="inline-flex gap-2">
                        <Button variant="ghost" onClick={() => remove(student.id)}>
                          Confirmar
                        </Button>
                        <Button variant="ghost" onClick={() => setRemoving(null)}>
                          Cancelar
                        </Button>
                      </span>
                    ) : (
                      <button type="button" className="text-caption text-ink-muted hover:text-off" onClick={() => setRemoving(student.id)}>
                        Tirar da turma
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SettingsCard({ klass, onChanged }: { klass: TeacherClassDetail; onChanged: () => void }) {
  const [name, setName] = useState(klass.name);
  const [description, setDescription] = useState(klass.description);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(changes: { name?: string; description?: string; archived?: boolean }) {
    setError(null);
    setSaved(false);
    try {
      await api.patch(`/teacher/classes/${klass.id}`, changes);
      setSaved(true);
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card title="Dados da turma">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save({ name: name.trim(), description: description.trim() });
        }}
      >
        <TextField label="Nome" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        <TextAreaField label="Descrição" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
        <FormError message={error} />
        {saved ? <Notice>Turma atualizada.</Notice> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={name.trim().length < 2}>
            Salvar
          </Button>
          <Button variant="ghost" onClick={() => save({ archived: !klass.archivedAt })}>
            {klass.archivedAt ? "Reabrir turma" : "Arquivar turma"}
          </Button>
        </div>
        <p className="text-caption text-ink-muted">Turma arquivada não aceita alunos novos pelo código; os alunos atuais continuam vendo o que já foi passado.</p>
      </form>
    </Card>
  );
}

export function TurmaPage() {
  const { classId = "" } = useParams();
  const detail = useApiData((signal) => api.get<TeacherClassDetail>(`/teacher/classes/${classId}`, signal), [classId]);
  return (
    <LoadState {...detail}>
      {(klass) => (
        <div className="grid gap-6">
          <PageHeader
            title={klass.name}
            back={{ to: "/professor", label: "Turmas" }}
            actions={
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {klass.archivedAt ? <Badge>Arquivada</Badge> : null}
                  <ButtonLink to={`/professor/tarefas/nova?turma=${klass.id}`} variant="primary">
                    Passar tarefa
                  </ButtonLink>
                  <ButtonLink to={`/professor/planos/novo?turma=${klass.id}`} variant="secondary">
                    Montar plano
                  </ButtonLink>
                </div>
              </>
            }
          />
          {klass.description ? <p className="-mt-4 max-w-prose text-body text-ink-muted">{klass.description}</p> : null}
          <div className="grid gap-6 lg:grid-cols-2">
            <CodeCard klass={klass} onChanged={detail.reload} />
            <AnnouncementsCard klass={klass} onChanged={detail.reload} />
            <StudentsCard klass={klass} onChanged={detail.reload} />
            <SettingsCard key={`${klass.name}|${klass.description}`} klass={klass} onChanged={detail.reload} />
          </div>
        </div>
      )}
    </LoadState>
  );
}
