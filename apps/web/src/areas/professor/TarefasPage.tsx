import { Link, useSearchParams } from "react-router";

import { api, queryString } from "@/api/client";
import type { TeacherAssignment } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { LoadState } from "@/account/ui";
import { Badge } from "@/design/fields";
import { ButtonLink, EmptyState, PageHeader } from "@/design/components";

import { audienceLabel, formatDueOn, todayIso } from "./teaching";

function AssignmentRow({ assignment }: { assignment: TeacherAssignment }) {
  const overdue = assignment.dueOn !== null && assignment.dueOn < todayIso() && assignment.done < assignment.recipients;
  return (
    <li>
      <Link to={`/professor/tarefas/${assignment.id}`} className="grid gap-2 rounded-lg bg-surface p-5 shadow-card transition-colors duration-fast ease-spalla hover:bg-surface-soft sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid gap-1">
          <h2 className="text-heading font-semibold text-ink">{assignment.title}</h2>
          <p className="text-caption text-ink-muted">
            {audienceLabel(assignment.className, assignment.studentName)} · {assignment.items.length} {assignment.items.length === 1 ? "item" : "itens"}
            {assignment.dueOn ? ` · entrega ${formatDueOn(assignment.dueOn)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overdue ? <Badge tone="warn">Atrasada</Badge> : null}
          <Badge tone={assignment.recipients > 0 && assignment.done === assignment.recipients ? "good" : "neutral"}>
            {assignment.done}/{assignment.recipients} feitas
          </Badge>
        </div>
      </Link>
    </li>
  );
}

export function TarefasPage() {
  const [params] = useSearchParams();
  const classId = params.get("turma") ?? undefined;
  const studentId = params.get("aluno") ?? undefined;
  const list = useApiData((signal) => api.get<TeacherAssignment[]>(`/teacher/assignments${queryString({ classId, studentId })}`, signal), [classId, studentId]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Tarefas"
        actions={
          <>
            <ButtonLink to="/professor/tarefas/nova" variant="primary">
              Nova tarefa
            </ButtonLink>
          </>
        }
      />
      <LoadState {...list}>
        {(assignments) =>
          assignments.length === 0 ? (
            <EmptyState
              title="Nenhuma tarefa passada"
              description="Uma tarefa junta exercícios, peças e orientações, com prazo opcional. O aluno marca como feita e você responde com um retorno."
              action={
                <ButtonLink to="/professor/tarefas/nova" variant="primary">
                  Passar a primeira tarefa
                </ButtonLink>
              }
            />
          ) : (
            <ul className="grid gap-3">
              {assignments.map((assignment) => (
                <AssignmentRow key={assignment.id} assignment={assignment} />
              ))}
            </ul>
          )
        }
      </LoadState>
    </div>
  );
}
