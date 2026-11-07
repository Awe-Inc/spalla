import { useState } from "react";

import type { PlanBlock } from "@/api/types";
import { FIELD_CLASS } from "@/design/fields";
import { BLOCK_LABELS, GOAL_LABELS, GOAL_ORDER, GOAL_VALUE_RANGE, MAX_BLOCK_MINUTES, setBlockGoal, setBlockMinutes, type RoutineGoal } from "@/data/routines";

import { ItemPicker, ReorderButtons } from "./pickers";
import { blockFromTeachable } from "./teaching";

function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function withVariation(block: PlanBlock, variation: string): PlanBlock {
  const { variation: _removed, ...rest } = block;
  return variation === "" ? rest : { ...rest, variation };
}

function withoutItem(block: PlanBlock): PlanBlock {
  const { itemTitle: _title, itemPath: _path, ...rest } = block;
  return { ...rest, itemId: "" };
}

export function BlockEditor({ block, index, count, onChange, onMove, onRemove }: { block: PlanBlock; index: number; count: number; onChange: (block: PlanBlock) => void; onMove: (delta: -1 | 1) => void; onRemove: () => void }) {
  const [picking, setPicking] = useState(false);
  const label = BLOCK_LABELS[block.type];
  const valueRange = GOAL_VALUE_RANGE[block.goal];

  return (
    <li className="grid gap-3 rounded-md border border-hairline p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-body font-semibold text-ink">
          <span className="mr-2 font-mono text-caption text-ink-subtle tabular">{index + 1}</span>
          {label}
        </p>
        <ReorderButtons index={index} count={count} onMove={onMove} onRemove={onRemove} label={label} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-caption text-ink-muted">
          Minutos
          <input
            type="number"
            min={1}
            max={MAX_BLOCK_MINUTES}
            inputMode="numeric"
            className={FIELD_CLASS}
            value={block.durationMinutes}
            onChange={(event) => onChange(setBlockMinutes([block], 0, Number(event.target.value))[0]! as PlanBlock)}
          />
        </label>
        <label className="grid gap-1 text-caption text-ink-muted">
          Meta
          <select className={FIELD_CLASS} value={block.goal} onChange={(event) => onChange(setBlockGoal([block], 0, event.target.value as RoutineGoal)[0]! as PlanBlock)}>
            {GOAL_ORDER.map((goal) => (
              <option key={goal} value={goal}>
                {GOAL_LABELS[goal]}
              </option>
            ))}
          </select>
        </label>
        {valueRange ? (
          <label className="grid gap-1 text-caption text-ink-muted">
            Quantidade
            <select className={FIELD_CLASS} value={block.goalValue} onChange={(event) => onChange(setBlockGoal([block], 0, block.goal, Number(event.target.value))[0]! as PlanBlock)}>
              {range(valueRange.min, valueRange.max).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <label className="grid gap-1 text-caption text-ink-muted">
        Como fazer (opcional)
        <input className={FIELD_CLASS} maxLength={200} placeholder="Ex.: arco inteiro, devagar, com bordão" value={block.variation ?? ""} onChange={(event) => onChange(withVariation(block, event.target.value))} />
      </label>
      {block.itemTitle ? (
        <div className="flex flex-wrap items-center gap-2 text-body">
          <span className="text-ink-muted">Fixo:</span>
          <span className="font-medium text-ink">{block.itemTitle}</span>
          <button type="button" className="text-caption text-ink-muted hover:text-ink" onClick={() => onChange(withoutItem(block))}>
            Soltar
          </button>
        </div>
      ) : picking ? (
        <ItemPicker
          onPick={(item) => {
            onChange({ ...blockFromTeachable(item, block.type, block.durationMinutes), goal: block.goal, goalValue: block.goalValue, ...(block.variation ? { variation: block.variation } : {}) });
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <div>
          <button type="button" className="text-caption text-primary underline-offset-4 hover:underline" onClick={() => setPicking(true)}>
            Fixar um exercício ou peça neste bloco
          </button>
          <p className="text-caption text-ink-subtle">Sem item fixo, o app escolhe um exercício do tipo certo para o nível do aluno.</p>
        </div>
      )}
    </li>
  );
}
