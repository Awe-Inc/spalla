import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link } from "react-router";

import { assignmentProgress, setAssignmentDone, useClassAssignments } from "@/account/classAssignments";
import type { StudentAssignment } from "@/api/types";
import { safePlayPath } from "@/areas/aulas/lessons";
import { db, type ExerciseResult } from "@/data/db";
import { Button, Card } from "@/design/components";

function dueSentence(dueOn: string | null): string {
  if (!dueOn) return "Sem prazo";
  const [year, month, day] = dueOn.split("-");
  return `Até ${day}/${month}/${year}`;
}

function AssignmentRow({ assignment, results }: { assignment: StudentAssignment; results: readonly ExerciseResult[] }) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const progress = assignmentProgress(assignment, results);
  const missingText = assignment.items.filter((item) => item.kind === "texto").map((item) => item.title);

  async function markDone() {
    setSaving(true);
    setFailed(false);
    try {
      await setAssignmentDone(assignment, true, assignment.studentNote);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium">{assignment.title}</span>
        <span className="text-caption text-ink-subtle">{dueSentence(assignment.dueOn)}</span>
      </div>
      <span className="text-caption text-ink-subtle">
        {assignment.teacherName} · {assignment.className}
      </span>
      <ul className="grid gap-1">
        {progress.items
          .filter(({ item }) => item.kind !== "texto")
          .map(({ item, met }, index) => {
            const path = safePlayPath(item.playPath);
            return (
              <li key={`${item.ref ?? item.title}-${index}`} className="flex items-center gap-2 text-body">
                <span aria-hidden className={met ? "text-in-tune" : "text-ink-subtle"}>
                  {met ? "✓" : "○"}
                </span>
                {path ? (
                  <Link to={path} className={met ? "text-ink-subtle line-through" : "hover:text-primary"}>
                    {item.title}
                  </Link>
                ) : (
                  <span>{item.title}</span>
                )}
                {item.bpm ? <span className="font-mono text-caption text-ink-subtle tabular">{item.bpm} bpm</span> : null}
                <span className="sr-only">{met ? "cumprido" : "falta tocar"}</span>
              </li>
            );
          })}
      </ul>
      {missingText.length > 0 ? <span className="text-caption text-ink-muted">Falta: {missingText.join("; ")}</span> : null}
      <div className="flex items-center gap-3">
        <Button onClick={() => void markDone()} disabled={saving}>
          {saving ? "Salvando…" : "Marcar como feita"}
        </Button>
        {failed ? <span className="text-caption text-off">Sem conexão com a escola. Tente de novo mais tarde.</span> : null}
      </div>
    </li>
  );
}

export function TarefasDaTurma() {
  const assignments = useClassAssignments();
  const open = assignments.filter((assignment) => assignment.doneAt === null);
  const refs = [...new Set(open.flatMap((assignment) => assignment.items.flatMap((item) => (item.ref ? [item.ref] : []))))];
  const results = useLiveQuery(() => (refs.length > 0 ? db.results.where("exerciseId").anyOf(refs).toArray() : Promise.resolve<ExerciseResult[]>([])), [refs.join("|")]) ?? [];
  if (open.length === 0) return null;
  return (
    <Card title="Tarefas da turma">
      <p className="text-caption text-ink-subtle">Tocando o que foi pedido, a tarefa se marca sozinha.</p>
      <ol className="divide-y divide-hairline">
        {open.map((assignment) => (
          <AssignmentRow key={assignment.id} assignment={assignment} results={results} />
        ))}
      </ol>
    </Card>
  );
}
