import { describe, expect, it } from "vitest";

import type { LessonTask } from "./db";
import { nextLessonSentence, splitTasks } from "./lessons";

const wednesday = new Date(2026, 9, 28, 10);

describe("nextLessonSentence", () => {
  it("is silent without a lesson day and counts the days until the next one", () => {
    expect(nextLessonSentence(null, wednesday)).toBeNull();
    expect(nextLessonSentence(3, wednesday)).toBe("Aula hoje.");
    expect(nextLessonSentence(4, wednesday)).toBe("Próxima aula: amanhã (quinta).");
    expect(nextLessonSentence(1, wednesday)).toBe("Próxima aula: segunda, em 5 dias.");
  });
});

describe("splitTasks", () => {
  it("keeps open tasks in creation order and done tasks newest first", () => {
    const tasks: LessonTask[] = [
      { id: 1, text: "b", blockType: "escalas", itemId: null, createdAt: 2, doneAt: null },
      { id: 2, text: "a", blockType: "escalas", itemId: null, createdAt: 1, doneAt: null },
      { id: 3, text: "old done", blockType: "livre", itemId: null, createdAt: 0, doneAt: 5 },
      { id: 4, text: "new done", blockType: "livre", itemId: null, createdAt: 3, doneAt: 6 },
    ];
    const { open, done } = splitTasks(tasks);
    expect(open.map((task) => task.text)).toEqual(["a", "b"]);
    expect(done.map((task) => task.text)).toEqual(["new done", "old done"]);
  });
});
