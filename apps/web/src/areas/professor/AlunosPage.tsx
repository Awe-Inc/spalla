import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { api } from "@/api/client";
import type { PracticeDaySummary, StudentProgress, TeacherStudent } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { formatDate, LoadState } from "@/account/ui";
import { Badge, FIELD_CLASS } from "@/design/fields";
import { accuracyToneClass, ButtonLink, Card, EmptyState, PageHeader, Stars } from "@/design/components";

import { useTeachableItems } from "./pickers";
import { formatDueOn } from "./teaching";

const PROGRESS_WINDOWS = [7, 30, 90] as const;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function AlunosPage() {
  const students = useApiData((signal) => api.get<TeacherStudent[]>("/teacher/students", signal), []);
  const [query, setQuery] = useState("");

  return (
    <div className="grid gap-6">
      <PageHeader title="Alunos" />
      <LoadState {...students}>
        {(list) => {
          if (list.length === 0) {
            return (
              <EmptyState
                title="Nenhum aluno ainda"
                description="Os alunos aparecem aqui quando entram em uma das suas turmas com o código."
                action={
                  <ButtonLink to="/professor" variant="primary">
                    Ver turmas
                  </ButtonLink>
                }
              />
            );
          }
          const needle = normalize(query.trim());
          const visible = needle ? list.filter((student) => normalize(`${student.name} ${student.email} ${student.classes.join(" ")}`).includes(needle)) : list;
          return (
            <div className="grid gap-4">
              <input type="search" aria-label="Buscar aluno" placeholder="Buscar por nome, e-mail ou turma" className={`${FIELD_CLASS} max-w-md`} value={query} onChange={(event) => setQuery(event.target.value)} />
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((student) => (
                  <li key={student.id}>
                    <Link to={`/professor/alunos/${student.id}`} className="grid h-full gap-2 rounded-lg bg-surface p-5 shadow-card transition-colors duration-fast ease-spalla hover:bg-surface-soft">
                      <span className="text-heading font-semibold text-ink">{student.name}</span>
                      <span className="text-caption text-ink-muted">{student.classes.join(", ") || "Sem turma"}</span>
                      <span className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                        <Badge tone={student.minutesLast7Days > 0 ? "good" : "neutral"}>{student.minutesLast7Days} min na semana</Badge>
                        última prática {formatDate(student.lastPracticeAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {visible.length === 0 ? <p className="text-body text-ink-muted">Ninguém com esse nome.</p> : null}
            </div>
          );
        }}
      </LoadState>
    </div>
  );
}

function MinutesChart({ days }: { days: PracticeDaySummary[] }) {
  const max = Math.max(1, ...days.map((day) => day.minutes));
  if (days.length === 0) return <p className="text-body text-ink-muted">Nenhuma prática enviada neste período.</p>;
  return (
    <ol className="flex h-36 items-end gap-1" aria-label="Minutos de prática por dia">
      {days.map((day) => (
        <li key={day.day} className="flex h-full flex-1 flex-col justify-end" title={`${formatDueOn(day.day)}: ${day.minutes} min`}>
          <div className="w-full rounded-sm bg-primary" style={{ height: `${Math.max(4, (day.minutes / max) * 100)}%` }} aria-label={`${formatDueOn(day.day)}: ${day.minutes} minutos`} />
        </li>
      ))}
    </ol>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-soft p-4">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="text-title font-semibold text-ink tabular">{value}</dd>
    </div>
  );
}

function driftText(cents: number): string {
  const rounded = Math.round(cents);
  if (Math.abs(rounded) <= 3) return "afinado";
  return `${Math.abs(rounded)} cents ${rounded < 0 ? "baixo" : "alto"}`;
}

export function AlunoPage() {
  const { studentId = "" } = useParams();
  const [days, setDays] = useState<(typeof PROGRESS_WINDOWS)[number]>(30);
  const progress = useApiData((signal) => api.get<StudentProgress>(`/teacher/students/${studentId}/progress?days=${days}`, signal), [studentId, days]);
  const { items } = useTeachableItems();
  const titles = useMemo(() => new Map(items.map((item) => [item.ref, item.title])), [items]);

  return (
    <LoadState {...progress}>
      {({ student, practice, assignments }) => (
        <div className="grid gap-6">
          <PageHeader
            title={student.name}
            back={{ to: "/professor/alunos", label: "Alunos" }}
            actions={
              <>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink to={`/professor/tarefas/nova?aluno=${student.id}`} variant="primary">
                    Passar tarefa
                  </ButtonLink>
                  <ButtonLink to={`/professor/planos/novo?aluno=${student.id}`} variant="secondary">
                    Montar plano
                  </ButtonLink>
                </div>
              </>
            }
          />
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Período">
            {PROGRESS_WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                role="radio"
                aria-checked={days === window}
                className={`h-10 rounded-pill px-4 text-body font-semibold transition-colors duration-fast ease-spalla ${days === window ? "bg-primary text-on-primary" : "bg-surface-soft text-ink hover:bg-surface-sunken"}`}
                onClick={() => setDays(window)}
              >
                {window} dias
              </button>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Minutos" value={String(practice.totalMinutes)} />
            <Stat label="Dias com prática" value={`${practice.daysPracticed}/${practice.days}`} />
            <Stat label="Exercícios tocados" value={String(practice.exercises.length)} />
            <Stat label="Última prática" value={formatDate(practice.lastPracticeAt)} />
          </dl>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Minutos por dia">
              <MinutesChart days={practice.byDay} />
            </Card>
            <Card title="Tarefas">
              {assignments.length === 0 ? (
                <p className="text-body text-ink-muted">Nenhuma tarefa para este aluno.</p>
              ) : (
                <ul className="grid gap-3">
                  {assignments.map((assignment) => (
                    <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2">
                      <Link to={`/professor/tarefas/${assignment.id}`} className="text-body font-medium text-primary underline-offset-4 hover:underline">
                        {assignment.title}
                      </Link>
                      <span className="flex items-center gap-2 text-caption text-ink-muted">
                        {assignment.dueOn ? formatDueOn(assignment.dueOn) : null}
                        {assignment.doneAt ? <Badge tone="good">Feita</Badge> : <Badge>Pendente</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <Card title="Exercícios">
            {practice.exercises.length === 0 ? (
              <p className="text-body text-ink-muted">O aluno ainda não sincronizou nenhuma prática. A sincronização acontece em Conta, com um toque.</p>
            ) : (
              <div className="-mx-6 overflow-x-auto px-6">
                <table className="w-full min-w-[40rem] text-left text-body">
                  <thead className="text-caption text-ink-muted">
                    <tr className="border-b border-hairline">
                      <th className="py-2 pr-4 font-medium">Exercício</th>
                      <th className="py-2 pr-4 font-medium">Vezes</th>
                      <th className="py-2 pr-4 font-medium">Melhor precisão</th>
                      <th className="py-2 pr-4 font-medium">Tendência</th>
                      <th className="py-2 pr-4 font-medium">BPM</th>
                      <th className="py-2 font-medium">Estrelas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {practice.exercises.map((exercise) => (
                      <tr key={exercise.exerciseId} className="border-b border-hairline last:border-0">
                        <td className="py-3 pr-4">
                          <span className="font-medium text-ink">{titles.get(exercise.exerciseId) ?? exercise.exerciseId}</span>
                          <span className="block text-caption text-ink-muted">{formatDate(exercise.lastPlayedAt)}</span>
                        </td>
                        <td className="py-3 pr-4 tabular">{exercise.plays}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-block rounded-pill px-2 py-0.5 text-caption font-semibold tabular ${accuracyToneClass(exercise.bestAccuracy)}`}>{Math.round(exercise.bestAccuracy)}%</span>
                        </td>
                        <td className="py-3 pr-4">{driftText(exercise.meanDriftCents)}</td>
                        <td className="py-3 pr-4 tabular">{exercise.bestBpm}</td>
                        <td className="py-3">
                          <Stars count={Math.max(0, Math.min(3, exercise.stars)) as 0 | 1 | 2 | 3} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </LoadState>
  );
}
