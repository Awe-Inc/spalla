import { useLiveQuery } from "dexie-react-hooks";
import { useState, type FormEvent } from "react";

import { useSettings } from "@/app/settings";
import { useCore } from "@/core/useCore";
import { db, type BlockKind, type LessonTask } from "@/data/db";
import { addLessonTask, nextLessonSentence, removeLessonTask, splitTasks, toggleLessonTask, WEEKDAY_NAMES } from "@/data/lessons";
import { BLOCK_KINDS, BLOCK_LABELS, ROUTINE_ORDER } from "@/data/routines";
import { weekSummary, weekWindow } from "@/data/weekSummary";
import { Button, Card } from "@/design/components";
import { COMPACT_FIELD_CLASS, FIELD_CLASS } from "@/design/fields";

import { ResumoDaSemana } from "./ResumoDaSemana";

const TASK_BLOCKS: BlockKind[] = [...ROUTINE_ORDER, "livre"];
const SELECT_CLASS = `${FIELD_CLASS} cursor-pointer pr-8`;

function TaskRow({ task, exerciseTitle }: { task: LessonTask; exerciseTitle: string | null }) {
  const isDone = task.doneAt !== null;
  return (
    <li className="flex items-center gap-3 py-2">
      <input type="checkbox" className="size-5 accent-primary" checked={isDone} onChange={() => void toggleLessonTask(task)} aria-label={`Feito: ${task.text}`} />
      <div className="grid flex-1 gap-0.5">
        <span className={isDone ? "text-ink-subtle line-through" : ""}>{task.text}</span>
        <span className="text-caption text-ink-subtle">
          {BLOCK_LABELS[task.blockType]}
          {exerciseTitle ? ` · ${exerciseTitle}` : ""}
        </span>
      </div>
      {task.id !== undefined ? (
        <button type="button" className="text-caption text-ink-subtle hover:text-off" onClick={() => void removeLessonTask(task.id!)} aria-label={`Apagar: ${task.text}`}>
          Apagar
        </button>
      ) : null}
    </li>
  );
}

export function CadernoDaAula() {
  const core = useCore();
  const tasks = useLiveQuery(() => db.lessonTasks.toArray(), []) ?? [];
  const days = useLiveQuery(() => db.practiceDays.toArray(), []) ?? [];
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];
  const lessonWeekday = useSettings((state) => state.lessonWeekday);
  const setLessonWeekday = useSettings((state) => state.setLessonWeekday);
  const [text, setText] = useState("");
  const [blockType, setBlockType] = useState<BlockKind>("peca-nova");
  const [itemId, setItemId] = useState<string>("");
  const [showDone, setShowDone] = useState(false);
  const { open, done } = splitTasks(tasks);
  const exercises = core.status === "ready" ? core.core.exercises.filter((exercise) => exercise.playable) : [];
  const linkable = exercises.filter((exercise) => BLOCK_KINDS[blockType].includes(exercise.kind));
  const titleOf = (id: string | null) => (id ? exercises.find((exercise) => exercise.id === id)?.title ?? null : null);
  const summary = weekSummary({ window: weekWindow(lessonWeekday, new Date()), days, results, tasks });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await addLessonTask(text, blockType, itemId || null);
    setText("");
    setItemId("");
  }

  return (
    <Card title="Caderno da aula" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink-muted">{nextLessonSentence(lessonWeekday, new Date()) ?? "Anote o que a professora pediu; vira bloco da sessão."}</p>
        <label className="flex items-center gap-2 text-caption text-ink-subtle">
          Dia da aula
          <select className={`${COMPACT_FIELD_CLASS} cursor-pointer pr-8`} value={lessonWeekday ?? ""} onChange={(event) => setLessonWeekday(event.target.value === "" ? null : Number(event.target.value))}>
            <option value="">Sem dia fixo</option>
            {WEEKDAY_NAMES.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {open.length > 0 ? (
        <ul className="divide-y divide-hairline">
          {open.map((task) => (
            <TaskRow key={task.id} task={task} exerciseTitle={titleOf(task.itemId)} />
          ))}
        </ul>
      ) : (
        <p className="text-caption text-ink-subtle">Nenhuma tarefa aberta.</p>
      )}
      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={(event) => void submit(event)}>
        <input name="tarefa" autoComplete="off" className={FIELD_CLASS} placeholder="O que praticar até a próxima aula…" value={text} onChange={(event) => setText(event.target.value)} aria-label="Tarefa" />
        <select className={SELECT_CLASS} value={blockType} aria-label="Bloco" onChange={(event) => { setBlockType(event.target.value as BlockKind); setItemId(""); }}>
          {TASK_BLOCKS.map((kind) => (
            <option key={kind} value={kind}>
              {BLOCK_LABELS[kind]}
            </option>
          ))}
        </select>
        <select className={SELECT_CLASS} value={itemId} aria-label="Exercício ligado" onChange={(event) => setItemId(event.target.value)} disabled={linkable.length === 0}>
          <option value="">Sem exercício</option>
          {linkable.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.title}
            </option>
          ))}
        </select>
        <Button type="submit" className="h-10 md:h-10" disabled={text.trim() === ""}>
          Anotar
        </Button>
      </form>
      {done.length > 0 ? (
        <div className="grid gap-1">
          <button type="button" className="w-fit text-caption font-semibold text-primary" onClick={() => setShowDone((current) => !current)}>
            {showDone ? "Esconder feitas" : `Ver ${done.length} ${done.length === 1 ? "feita" : "feitas"}`}
          </button>
          {showDone ? (
            <ul className="divide-y divide-hairline">
              {done.map((task) => (
                <TaskRow key={task.id} task={task} exerciseTitle={titleOf(task.itemId)} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <ResumoDaSemana summary={summary} titleOf={titleOf} />
    </Card>
  );
}
