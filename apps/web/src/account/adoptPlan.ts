import type { PlanBlock, StudentPlan } from "@/api/types";
import { db, type Routine, type RoutineBlock } from "@/data/db";
import { totalMinutes } from "@/data/routines";

export function planBlocksToRoutine(blocks: readonly PlanBlock[]): RoutineBlock[] {
  return blocks.map((block) => ({ ...block, durationMinutes: Math.max(1, Math.round(block.durationMinutes)) }));
}

export async function adoptPlan(plan: StudentPlan): Promise<number> {
  const blocks = planBlocksToRoutine(plan.blocks);
  const record: Omit<Routine, "id"> = {
    name: plan.name,
    durationMinutes: totalMinutes(blocks),
    blocks,
    origin: "professor",
    createdAt: Date.now(),
    teacherPlanId: plan.id,
  };
  const existing = (await db.routines.where("origin").equals("professor").toArray()).find((routine) => routine.teacherPlanId === plan.id);
  if (existing?.id !== undefined) {
    await db.routines.update(existing.id, { ...record, createdAt: existing.createdAt });
    return existing.id;
  }
  const id = await db.routines.add(record);
  if (id === undefined) throw new Error("Não deu para guardar o plano neste aparelho.");
  return id;
}
