import { useState, type DragEvent } from "react";

import { useSettings } from "@/app/settings";
import { db, type BlockKind, type Routine, type RoutineBlock } from "@/data/db";
import {
  addBlock,
  BLOCK_LABELS,
  blocksFromMinutes,
  DEFAULT_ROUTINE_ID,
  DEFAULT_ROUTINE_MINUTES,
  GOAL_LABELS,
  GOAL_ORDER,
  GOAL_VALUE_RANGE,
  hasRepeatedNeighbours,
  MAX_BLOCK_MINUTES,
  moveBlock,
  pinnedItem,
  removeBlock,
  ROUTINE_ORDER,
  setBlockGoal,
  setBlockMinutes,
  totalMinutes,
  unpinBlock,
  type RoutineGoal,
} from "@/data/routines";
import { Button, Card } from "@/design/components";
import { COMPACT_FIELD_CLASS, FIELD_CLASS } from "@/design/fields";

interface RoutinePickerProps {
  routines: Routine[];
}

interface RoutineEditorProps {
  routine?: Routine;
  onClose: () => void;
}

const SMALL_BUTTON_CLASS = "rounded-sm px-2 py-1 text-caption text-ink-subtle transition-colors duration-fast ease-spalla hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";
const ADDABLE_TYPES: readonly BlockKind[] = [...ROUTINE_ORDER, "estudo", "livre"];

function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

interface BlockRowProps {
  block: RoutineBlock;
  index: number;
  count: number;
  dragging: boolean;
  onMove: (to: number) => void;
  onMinutes: (minutes: number) => void;
  onGoal: (goal: RoutineGoal, goalValue?: number) => void;
  onRemove: () => void;
  onUnpin: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function BlockRow({ block, index, count, dragging, onMove, onMinutes, onGoal, onRemove, onUnpin, onDragStart, onDrop, onDragEnd }: BlockRowProps) {
  const pinned = pinnedItem(block);
  const label = pinned ? `${BLOCK_LABELS[block.type]}: ${pinned.title}` : BLOCK_LABELS[block.type];
  const valueRange = GOAL_VALUE_RANGE[block.goal];
  function allowDrop(event: DragEvent<HTMLLIElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }
  function startDrag(event: DragEvent<HTMLLIElement>) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    onDragStart();
  }
  return (
    <li
      draggable
      aria-label={`${index + 1}. ${label}`}
      onDragStart={startDrag}
      onDragOver={allowDrop}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={`grid gap-2 rounded-md bg-surface-soft p-3 transition-opacity duration-fast ease-spalla sm:grid-cols-[auto_1fr_auto] sm:items-center ${dragging ? "opacity-50" : ""}`}
    >
      <span className="flex items-center gap-2 text-body font-semibold">
        <span aria-hidden className="cursor-grab select-none text-ink-subtle">
          ⋮⋮
        </span>
        <span className="font-mono text-caption text-ink-subtle tabular">{index + 1}</span>
        {label}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-caption text-ink-subtle">
        <label className="flex items-center gap-1">
          <input type="number" min={1} max={MAX_BLOCK_MINUTES} value={block.durationMinutes} aria-label={`Minutos de ${label}`} onChange={(event) => onMinutes(Number(event.target.value))} className={`${COMPACT_FIELD_CLASS} w-16 text-right font-mono tabular`} />
          min
        </label>
        <select className={FIELD_CLASS} value={block.goal} aria-label={`Meta de ${label}`} onChange={(event) => onGoal(event.target.value as RoutineGoal)}>
          {GOAL_ORDER.map((goal) => (
            <option key={goal} value={goal}>
              {GOAL_LABELS[goal]}
            </option>
          ))}
        </select>
        {valueRange ? (
          <select className={FIELD_CLASS} value={block.goalValue} aria-label={`Quantidade da meta de ${label}`} onChange={(event) => onGoal(block.goal, Number(event.target.value))}>
            {range(valueRange.min, valueRange.max).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ) : null}
      </span>
      <span className="flex items-center gap-1 justify-self-end">
        <button type="button" className={SMALL_BUTTON_CLASS} aria-label={`Subir ${label}`} disabled={index === 0} onClick={() => onMove(index - 1)}>
          Subir
        </button>
        <button type="button" className={SMALL_BUTTON_CLASS} aria-label={`Descer ${label}`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
          Descer
        </button>
        {pinned ? (
          <button type="button" className={SMALL_BUTTON_CLASS} aria-label={`Soltar ${pinned.title}: o app volta a escolher`} onClick={onUnpin}>
            Soltar peça
          </button>
        ) : null}
        <button type="button" className={`${SMALL_BUTTON_CLASS} hover:text-off`} aria-label={`Tirar ${label}`} onClick={onRemove}>
          Tirar
        </button>
      </span>
    </li>
  );
}

export function RoutineEditor({ routine, onClose }: RoutineEditorProps) {
  const [name, setName] = useState(routine?.name ?? "Minha rotina");
  const [blocks, setBlocks] = useState<RoutineBlock[]>(() => routine?.blocks ?? blocksFromMinutes(DEFAULT_ROUTINE_MINUTES[25]));
  const [newType, setNewType] = useState<BlockKind>("estudo");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const setRoutine = useSettings((state) => state.setRoutine);
  const total = totalMinutes(blocks);
  const repeated = hasRepeatedNeighbours(blocks);

  async function save() {
    const record = { name: name.trim() || "Minha rotina", durationMinutes: total, blocks };
    if (routine?.id !== undefined) {
      await db.routines.update(routine.id, record);
    } else {
      const id = await db.routines.add({ ...record, origin: "propria", createdAt: Date.now() });
      if (typeof id === "number") setRoutine(id);
    }
    onClose();
  }

  function drop(to: number) {
    if (dragIndex !== null) setBlocks((current) => moveBlock(current, dragIndex, to));
    setDragIndex(null);
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
        <input value={name} onChange={(event) => setName(event.target.value)} name="nome-rotina" autoComplete="off" className={FIELD_CLASS} maxLength={40} />
      </label>
      <p className="text-caption text-ink-subtle">Arraste os blocos para mudar a ordem, ou use Subir e Descer. Cada bloco tem seus minutos e a meta que fecha o bloco.</p>
      <ol className="grid gap-2" aria-label="Blocos da rotina">
        {blocks.map((block, index) => (
          <BlockRow
            key={`${block.type}-${index}`}
            block={block}
            index={index}
            count={blocks.length}
            dragging={dragIndex === index}
            onMove={(to) => setBlocks((current) => moveBlock(current, index, to))}
            onMinutes={(minutes) => setBlocks((current) => setBlockMinutes(current, index, minutes))}
            onGoal={(goal, goalValue) => setBlocks((current) => setBlockGoal(current, index, goal, goalValue))}
            onRemove={() => setBlocks((current) => removeBlock(current, index))}
            onUnpin={() => setBlocks((current) => unpinBlock(current, index))}
            onDragStart={() => setDragIndex(index)}
            onDrop={() => drop(index)}
            onDragEnd={() => setDragIndex(null)}
          />
        ))}
      </ol>
      {repeated ? <p className="text-caption text-close">Dois blocos iguais seguidos: separe com outro tipo para a rotina não ficar monótona.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <select className={FIELD_CLASS} value={newType} aria-label="Tipo do bloco novo" onChange={(event) => setNewType(event.target.value as BlockKind)}>
          {ADDABLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {BLOCK_LABELS[type]}
            </option>
          ))}
        </select>
        <Button onClick={() => setBlocks((current) => addBlock(current, newType))}>Adicionar bloco</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={blocks.length === 0}>
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
  const [editing, setEditing] = useState<Routine | "new" | null>(null);

  async function remove(routine: Routine) {
    if (routine.id === undefined || routine.origin === "padrao") return;
    await db.routines.delete(routine.id);
    if (routineId === routine.id) setRoutine(DEFAULT_ROUTINE_ID);
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
                className={`grid gap-1 rounded-md p-4 text-left transition-colors duration-fast ease-spalla ${active ? "bg-primary-soft text-primary" : "bg-surface-soft text-ink hover:bg-surface-sunken"}`}
              >
                <span className="font-semibold">{routine.name}</span>
                <span className="text-caption text-ink-subtle">
                  {routine.durationMinutes} min · {routine.blocks.length} blocos{routine.origin === "propria" ? " · sua" : ""}
                </span>
              </button>
              {routine.origin === "propria" ? (
                <span className="flex justify-end">
                  <button type="button" className={SMALL_BUTTON_CLASS} onClick={() => setEditing(routine)}>
                    Editar
                  </button>
                  <button type="button" className={`${SMALL_BUTTON_CLASS} hover:text-off`} onClick={() => void remove(routine)}>
                    Apagar
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {editing ? <RoutineEditor key={editing === "new" ? "new" : editing.id} routine={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : <Button onClick={() => setEditing("new")}>Criar rotina própria</Button>}
    </Card>
  );
}
