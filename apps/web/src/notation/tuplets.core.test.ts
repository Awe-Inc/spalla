// @vitest-environment node
import { loadCore } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { beamCount, beamGroupOf, durationQuarters } from "./staffLayout";
import { findTuplets } from "./tuplets";

async function accelerationScore() {
  const core = await loadCore();
  const score = core.exerciseScore("bowing.accel");
  if (!score) throw new Error("sem a partitura da Aceleração");
  return score;
}

describe("tercinas nos exercícios do currículo", () => {
  it("a Aceleração marca as semínimas de tercina (3 por arcada) e as colcheias de tercina (6 por arcada)", async () => {
    const score = await accelerationScore();
    const spans = findTuplets(score);
    const lengths = new Set(spans.map((span) => durationQuarters(score, span.first).toFixed(3)));
    expect(lengths).toEqual(new Set(["0.667", "0.333"]));
    expect(spans.every((span) => span.label === "3")).toBe(true);
  });

  it("semínima de tercina sai sem feixe e sem bandeira; colcheia de tercina vai num feixe por tempo", async () => {
    const score = await accelerationScore();
    for (const span of findTuplets(score)) {
      const quarters = durationQuarters(score, span.first);
      const group = beamGroupOf(score.beamGroups, span.first);
      if (quarters > 0.5) {
        expect(beamCount(quarters)).toBe(0);
        expect(group).toBeNull();
      } else {
        expect(group).toEqual({ first: span.first, last: span.last });
      }
    }
  });

  it("escalas em colcheias não ganham número de tercina", async () => {
    const core = await loadCore();
    const score = core.exerciseScore("scales.1oct.69");
    if (!score) throw new Error("sem partitura");
    expect(findTuplets(score)).toEqual([]);
  });
});
