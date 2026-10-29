import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { useSettings } from "@/app/settings";
import { useRoutines } from "@/areas/hoje/useTodayPlan";
import type { BlockKind } from "@/data/db";
import { addItemToRoutine, BLOCK_LABELS, PINNABLE_TYPES, routineHasItem, type RoutineItem } from "@/data/routines";
import { Button, Card, InlineError } from "@/design/components";
import { FIELD_CLASS } from "@/design/fields";

const SELECT_CLASS = `${FIELD_CLASS} cursor-pointer pr-8`;

export function AddToRoutine({ item }: { item: RoutineItem }) {
  const routines = useRoutines();
  const routineId = useSettings((state) => state.routineId);
  const setRoutine = useSettings((state) => state.setRoutine);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [type, setType] = useState<BlockKind>("peca-nova");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const containing = routines.filter((routine) => routineHasItem(routine, item.id));
  const target = routines.find((routine) => routine.id === (chosenId ?? routineId)) ?? routines[0];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    setSaving(true);
    setFailed(false);
    try {
      const id = await addItemToRoutine(target, item, type);
      setRoutine(id);
      setChosenId(id);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Rotina" className="grid gap-3">
      {containing.length > 0 ? (
        <p className="text-small text-ink-muted">
          Já está em {containing.map((routine) => routine.name).join(", ")}.{" "}
          <Link to="/" className="font-semibold text-primary underline-offset-4 hover:underline">
            Ver a sessão de hoje
          </Link>
        </p>
      ) : (
        <p className="text-small text-ink-muted">Ponha esta peça num bloco da sua rotina. Ela aparece na sessão no lugar da peça que o app escolheria para esse bloco.</p>
      )}
      {target && !routineHasItem(target, item.id) ? (
        <form className="grid gap-3" onSubmit={(event) => void submit(event)} aria-label="Adicionar à rotina">
          <label className="grid gap-1.5 text-small font-medium text-ink-muted">
            Rotina
            <select className={SELECT_CLASS} value={target.id} onChange={(event) => setChosenId(Number(event.target.value))}>
              {routines.map((routine) => (
                <option key={routine.id} value={routine.id}>
                  {routine.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-small font-medium text-ink-muted">
            Bloco
            <select className={SELECT_CLASS} value={type} onChange={(event) => setType(event.target.value as BlockKind)}>
              {PINNABLE_TYPES.map((kind) => (
                <option key={kind} value={kind}>
                  {BLOCK_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" icon="mais" loading={saving} disabled={saving}>
            Adicionar à rotina
          </Button>
        </form>
      ) : null}
      {target?.origin === "padrao" && !routineHasItem(target, item.id) ? (
        <p className="text-caption text-ink-subtle">As rotinas prontas não mudam: o app cria uma cópia sua com a peça e passa a usá-la.</p>
      ) : null}
      {failed ? <InlineError title="A peça não entrou na rotina." nextStep="Tente de novo. Se continuar, recarregue a página." /> : null}
    </Card>
  );
}
