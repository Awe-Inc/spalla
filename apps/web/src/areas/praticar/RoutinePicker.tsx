import { useState } from "react";

import { useSettings } from "@/app/settings";
import { db, type BlockKind, type Routine } from "@/data/db";
import { BLOCK_LABELS, blocksFromMinutes, DEFAULT_ROUTINE_MINUTES, ROUTINE_ORDER, totalMinutes, type RoutineMinutes } from "@/data/routines";
import { Button, Card } from "@/design/components";

interface RoutinePickerProps {
  routines: Routine[];
}

function RoutineEditor({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("Minha rotina");
  const [minutes, setMinutes] = useState<RoutineMinutes>(DEFAULT_ROUTINE_MINUTES[25]);
  const setRoutine = useSettings((state) => state.setRoutine);
  const blocks = blocksFromMinutes(minutes);
  const total = totalMinutes(blocks);

  async function save() {
    const id = await db.routines.add({ name: name.trim() || "Minha rotina", durationMinutes: total, blocks, origin: "propria", createdAt: Date.now() });
    if (typeof id === "number") setRoutine(id);
    onClose();
  }

  function setBlock(type: BlockKind, value: number) {
    setMinutes((current) => ({ ...current, [type]: Math.max(0, Math.min(30, value)) }));
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="grid gap-1 text-caption text-ink-subtle">
        Nome
        <input value={name} onChange={(event) => setName(event.target.value)} className="h-10 rounded-sm bg-surface-soft px-3 text-body text-ink" maxLength={40} />
      </label>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ROUTINE_ORDER.map((type) => (
          <li key={type}>
            <label className="flex items-center justify-between gap-3 text-body">
              <span>{BLOCK_LABELS[type]}</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={minutes[type] ?? 0}
                  onChange={(event) => setBlock(type, Number(event.target.value))}
                  className="h-9 w-16 rounded-sm bg-surface-soft px-2 text-right font-mono text-body text-ink tabular"
                />
                <span className="text-caption text-ink-subtle">min</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={total === 0}>
          Salvar rotina de {total} min
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function RoutinePicker({ routines }: RoutinePickerProps) {
  const routineId = useSettings((state) => state.routineId);
  const setRoutine = useSettings((state) => state.setRoutine);
  const [editing, setEditing] = useState(false);

  async function remove(routine: Routine) {
    if (routine.id === undefined || routine.origin === "padrao") return;
    await db.routines.delete(routine.id);
    if (routineId === routine.id) setRoutine(-25);
  }

  return (
    <Card title="Rotina do dia" className="grid gap-4">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Rotina do dia">
        {routines.map((routine) => {
          const active = routine.id === routineId;
          return (
            <li key={routine.id} className="grid">
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => routine.id !== undefined && setRoutine(routine.id)}
                className={`grid gap-1 rounded-md p-4 text-left transition-colors duration-fast ease-fretless ${active ? "bg-primary-soft text-primary" : "bg-surface-soft text-ink hover:bg-surface-sunken"}`}
              >
                <span className="font-semibold">{routine.name}</span>
                <span className="text-caption text-ink-subtle">
                  {routine.durationMinutes} min · {routine.blocks.length} blocos
                  {routine.origin === "propria" ? " · sua" : ""}
                </span>
              </button>
              {routine.origin === "propria" ? (
                <button type="button" className="justify-self-end px-2 py-1 text-caption text-ink-subtle hover:text-off" onClick={() => void remove(routine)}>
                  Apagar
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {editing ? <RoutineEditor onClose={() => setEditing(false)} /> : <Button onClick={() => setEditing(true)}>Criar rotina própria</Button>}
    </Card>
  );
}
