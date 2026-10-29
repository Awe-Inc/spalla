import { describe, expect, it } from "vitest";

import type { AssignmentItem, StudentAssignment } from "@/api/types";
import type { ExerciseResult } from "@/data/db";

import { assignmentProgress, assignmentsReadyToComplete, openClassTasks } from "./classAssignments";

const CREATED = "2026-10-20T12:00:00.000Z";
const createdAt = Date.parse(CREATED);

function assignment(id: string, items: AssignmentItem[], overrides: Partial<StudentAssignment> = {}): StudentAssignment {
  return {
    id,
    title: `Tarefa ${id}`,
    instructions: "",
    dueOn: null,
    items,
    materialIds: [],
    createdAt: CREATED,
    className: "Turma",
    teacherName: "Ana",
    doneAt: null,
    studentNote: "",
    feedback: "",
    feedbackAt: null,
    ...overrides,
  };
}

function exerciseItem(ref: string, extra: Partial<AssignmentItem> = {}): AssignmentItem {
  return { kind: "exercicio", title: ref, ref, playPath: `/tocar/${ref}`, ...extra };
}

function run(exerciseId: string, stars: 0 | 1 | 2 | 3, bpm: number, playedAt = createdAt + 1000): ExerciseResult {
  return { exerciseId, stars, bpm, playedAt, accuracyPct: 90, meanSignedCents: 0, durationSeconds: 30 };
}

describe("assignmentProgress", () => {
  it("não conta execução anterior à tarefa", () => {
    const progress = assignmentProgress(assignment("1", [exerciseItem("scale-1")]), [run("scale-1", 3, 80, createdAt - 1)]);
    expect(progress.met).toBe(0);
    expect(progress.complete).toBe(false);
  });

  it("exige as estrelas e o bpm pedidos", () => {
    const item = exerciseItem("scale-1", { stars: 2, bpm: 72 });
    expect(assignmentProgress(assignment("1", [item]), [run("scale-1", 1, 80)]).complete).toBe(false);
    expect(assignmentProgress(assignment("1", [item]), [run("scale-1", 2, 66)]).complete).toBe(false);
    expect(assignmentProgress(assignment("1", [item]), [run("scale-1", 2, 72)]).complete).toBe(true);
  });

  it("tarefa com item de texto nunca se conclui sozinha", () => {
    const progress = assignmentProgress(assignment("1", [exerciseItem("scale-1"), { kind: "texto", title: "Ler o capítulo 2" }]), [run("scale-1", 3, 80)]);
    expect(progress.met).toBe(1);
    expect(progress.playable).toBe(1);
    expect(progress.hasText).toBe(true);
    expect(progress.complete).toBe(false);
  });
});

describe("assignmentsReadyToComplete", () => {
  it("só devolve tarefas abertas que contêm o exercício tocado e estão cumpridas", () => {
    const tasks = [
      assignment("a", [exerciseItem("scale-1")]),
      assignment("b", [exerciseItem("scale-1"), exerciseItem("piece-1")]),
      assignment("c", [exerciseItem("scale-1")], { doneAt: CREATED }),
      assignment("d", [exerciseItem("piece-2")]),
    ];
    const results = [run("scale-1", 2, 60), run("piece-2", 2, 60)];
    expect(assignmentsReadyToComplete(tasks, results, "scale-1").map((task) => task.id)).toEqual(["a"]);
    expect(assignmentsReadyToComplete(tasks, results).map((task) => task.id)).toEqual(["a", "d"]);
  });
});

describe("openClassTasks", () => {
  it("achata os itens tocáveis das tarefas abertas, com prazo mais próximo primeiro", () => {
    const tasks = [
      assignment("sem-prazo", [exerciseItem("piece-1")]),
      assignment("tarde", [exerciseItem("scale-2", { bpm: 70 })], { dueOn: "2026-11-10" }),
      assignment("cedo", [exerciseItem("scale-1"), { kind: "texto", title: "Ler" }], { dueOn: "2026-11-01" }),
      assignment("feita", [exerciseItem("read-1")], { doneAt: CREATED }),
    ];
    const items = openClassTasks(tasks);
    expect(items.map((item) => item.exerciseId)).toEqual(["scale-1", "scale-2", "piece-1"]);
    expect(items[1]?.bpm).toBe(70);
  });
});
