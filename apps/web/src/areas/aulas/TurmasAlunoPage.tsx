import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { Lessons, StudentClass } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { formatDate, formatDateTime, FormError, LoadState, Notice } from "@/account/ui";
import { TextField } from "@/design/fields";
import { Button, Card, PageHeader } from "@/design/components";

function JoinForm({ onJoined }: { onJoined: (name: string) => void }) {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("codigo") ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const klass = await api.post<{ name: string }>("/me/classes/join", { code: code.trim().toUpperCase() });
      setCode("");
      onJoined(klass.name);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Entrar numa turma">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <TextField label="Código da turma" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} value={code} onChange={(event) => setCode(event.target.value)} hint="O professor te passa o código ou o link de convite." />
        </div>
        <Button type="submit" variant="primary" disabled={pending || code.trim().length < 4}>
          {pending ? "Entrando…" : "Entrar"}
        </Button>
      </form>
      <FormError message={error} />
    </Card>
  );
}

function ClassRow({ klass, onLeft }: { klass: StudentClass; onLeft: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setError(null);
    try {
      await api.delete(`/me/classes/${klass.id}`);
      onLeft();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <li className="grid gap-2 border-b border-hairline py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5">
          <span className="font-medium text-ink">{klass.name}</span>
          <span className="text-caption text-ink-muted">
            {klass.teacherName}. Desde {formatDate(klass.joinedAt)}
          </span>
        </div>
        {confirming ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-body text-ink">Sair da turma?</span>
            <Button variant="ghost" onClick={() => void leave()}>
              Sair
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Ficar
            </Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Sair da turma
          </Button>
        )}
      </div>
      {klass.description ? <p className="text-body text-ink-muted">{klass.description}</p> : null}
      <FormError message={error} />
    </li>
  );
}

export function TurmasAlunoPage() {
  const classes = useApiData((signal) => api.get<StudentClass[]>("/me/classes", signal), []);
  const lessons = useApiData((signal) => api.get<Lessons>("/me/lessons", signal), []);
  const [joined, setJoined] = useState<string | null>(null);

  function refresh() {
    classes.reload();
    lessons.reload();
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Turmas e avisos" />
      <JoinForm
        onJoined={(name) => {
          setJoined(name);
          refresh();
        }}
      />
      {joined ? <Notice>Você entrou na turma {joined}. As tarefas e materiais dela já aparecem nas outras abas.</Notice> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Suas turmas">
          <LoadState {...classes}>
            {(list) =>
              list.length === 0 ? (
                <p className="text-body text-ink-muted">Você ainda não está em nenhuma turma.</p>
              ) : (
                <ul>
                  {list.map((klass) => (
                    <ClassRow key={klass.id} klass={klass} onLeft={refresh} />
                  ))}
                </ul>
              )
            }
          </LoadState>
        </Card>
        <Card title="Avisos">
          <LoadState {...lessons}>
            {({ announcements }) =>
              announcements.length === 0 ? (
                <p className="text-body text-ink-muted">Nenhum aviso.</p>
              ) : (
                <ul className="grid gap-4">
                  {announcements.map((announcement) => (
                    <li key={announcement.id} className="grid gap-1">
                      <p className="text-caption text-ink-muted">
                        {announcement.authorName}, {announcement.className}. {formatDateTime(announcement.createdAt)}
                      </p>
                      <p className="whitespace-pre-line text-body text-ink">{announcement.body}</p>
                    </li>
                  ))}
                </ul>
              )
            }
          </LoadState>
        </Card>
      </div>
    </div>
  );
}
