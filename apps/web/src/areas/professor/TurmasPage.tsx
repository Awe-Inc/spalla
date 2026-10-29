import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { TeacherClass } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { Badge, FormError, LoadState, TextAreaField, TextField } from "@/account/ui";
import { Button, Card, EmptyState, PageTitle } from "@/design/components";

function CreateClassForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await api.post<{ id: string }>("/teacher/classes", { name: name.trim(), description: description.trim() });
      navigate(`/professor/turmas/${created.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <Card title="Nova turma">
      <form onSubmit={submit} className="grid gap-4">
        <TextField label="Nome da turma" placeholder="Ex.: Violino iniciante — terças" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        <TextAreaField label="Descrição (opcional)" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
        <FormError message={error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={pending || name.trim().length < 2}>
            Criar turma
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ClassCard({ klass }: { klass: TeacherClass }) {
  return (
    <Link
      to={`/professor/turmas/${klass.id}`}
      className={`grid gap-3 rounded-lg bg-surface p-5 shadow-card transition-colors duration-fast ease-fretless hover:bg-surface-soft ${klass.archivedAt ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-heading font-semibold text-ink">{klass.name}</h2>
        {klass.archivedAt ? <Badge>Arquivada</Badge> : null}
      </div>
      {klass.description ? <p className="line-clamp-2 text-caption text-ink-muted">{klass.description}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-muted">
        <span>
          {klass.students} {klass.students === 1 ? "aluno" : "alunos"}
        </span>
        <span className="font-mono tracking-wider text-ink">{klass.joinCode}</span>
      </div>
    </Link>
  );
}

export function TurmasPage() {
  const classes = useApiData((signal) => api.get<TeacherClass[]>("/teacher/classes", signal), []);
  const [creating, setCreating] = useState(false);

  return (
    <div className="grid gap-6">
      <PageTitle title="Turmas" eyebrow="Área do professor">
        {creating ? null : (
          <Button variant="primary" onClick={() => setCreating(true)}>
            Nova turma
          </Button>
        )}
      </PageTitle>
      {creating ? <CreateClassForm onCancel={() => setCreating(false)} /> : null}
      <LoadState {...classes}>
        {(list) =>
          list.length === 0 ? (
            creating ? null : (
              <EmptyState
                title="Nenhuma turma ainda"
                description="Crie uma turma e passe o código para os alunos. Eles entram com o código na hora de criar a conta ou em Minhas aulas."
                action={
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    Criar a primeira turma
                  </Button>
                }
              />
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((klass) => (
                <ClassCard key={klass.id} klass={klass} />
              ))}
            </div>
          )
        }
      </LoadState>
    </div>
  );
}
