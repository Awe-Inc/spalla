import { describe, expect, it } from "vitest";

import type { RoutineBlock } from "./db";
import { addBlock, blocksFromMinutes, clampGoalValue, DEFAULT_ROUTINE_MINUTES, goalSummary, moveBlock, removeBlock, setBlockGoal, setBlockMinutes, totalMinutes } from "./routines";

const blocks = blocksFromMinutes(DEFAULT_ROUTINE_MINUTES[15]);
const types = (list: readonly RoutineBlock[]) => list.map((block) => block.type);

describe("moveBlock", () => {
  it("moves a block to the new position without touching the others", () => {
    expect(types(moveBlock(blocks, 0, 2))).toEqual(["afinacao", "escalas", "aquecimento", "tecnica", "peca-nova", "revisao"]);
    expect(types(moveBlock(blocks, 5, 0))).toEqual(["revisao", "aquecimento", "afinacao", "escalas", "tecnica", "peca-nova"]);
  });

  it("returns a copy untouched when the move is a no-op or out of range", () => {
    expect(moveBlock(blocks, 1, 1)).toEqual(blocks);
    expect(moveBlock(blocks, 1, 1)).not.toBe(blocks);
    expect(moveBlock(blocks, -1, 2)).toEqual(blocks);
    expect(moveBlock(blocks, 0, 99)).toEqual(blocks);
    expect(types(blocks)).toEqual(["aquecimento", "afinacao", "escalas", "tecnica", "peca-nova", "revisao"]);
  });
});

describe("addBlock and removeBlock", () => {
  it("appends a block with the goal its type deserves and removes by index", () => {
    const added = addBlock(blocks, "estudo");
    expect(added).toHaveLength(7);
    expect(added[6]).toMatchObject({ type: "estudo", goal: "repeticoes-limpas", goalValue: 3, durationMinutes: 3, itemId: "" });
    expect(addBlock(blocks, "leitura")[6]).toMatchObject({ goal: "uma-vez", goalValue: 1 });
    expect(types(removeBlock(added, 0))).not.toContain("aquecimento");
    expect(removeBlock(added, 0)).toHaveLength(6);
  });
});

describe("setBlockMinutes", () => {
  it("keeps minutes between 1 and 30 and updates the total", () => {
    expect(setBlockMinutes(blocks, 0, 0)[0]!.durationMinutes).toBe(1);
    expect(setBlockMinutes(blocks, 0, 45)[0]!.durationMinutes).toBe(30);
    expect(setBlockMinutes(blocks, 0, Number.NaN)[0]!.durationMinutes).toBe(1);
    expect(totalMinutes(setBlockMinutes(blocks, 0, 7))).toBe(totalMinutes(blocks) + 5);
  });
});

describe("setBlockGoal", () => {
  it("switches the goal with a sensible default value and clamps explicit ones", () => {
    const stars = setBlockGoal(blocks, 0, "estrelas");
    expect(stars[0]).toMatchObject({ goal: "estrelas", goalValue: 2 });
    expect(setBlockGoal(blocks, 0, "repeticoes-limpas")[0]).toMatchObject({ goal: "repeticoes-limpas", goalValue: 3 });
    expect(setBlockGoal(blocks, 0, "repeticoes-limpas", 10)[0]!.goalValue).toBe(6);
    expect(setBlockGoal(blocks, 0, "repeticoes-limpas", 1)[0]!.goalValue).toBe(2);
    expect(setBlockGoal(blocks, 0, "uma-vez", 7)[0]!.goalValue).toBe(1);
    expect(setBlockGoal(stars, 0, "estrelas")[0]!.goalValue).toBe(2);
    expect(blocks[0]!.goal).toBe("uma-vez");
  });

  it("clamps per goal", () => {
    expect(clampGoalValue("estrelas", 9)).toBe(3);
    expect(clampGoalValue("estrelas", 0)).toBe(1);
    expect(clampGoalValue("tempo", 42)).toBe(1);
  });
});

describe("goalSummary", () => {
  it("describes the goal in Portuguese", () => {
    const base = blocks[2]!;
    expect(goalSummary(base)).toBe("3 limpas seguidas");
    expect(goalSummary({ ...base, goal: "estrelas", goalValue: 1 })).toBe("1 estrela");
    expect(goalSummary({ ...base, goal: "tempo", durationMinutes: 4 })).toBe("4 min");
    expect(goalSummary({ ...base, goal: "uma-vez" })).toBe("uma vez");
  });
});
