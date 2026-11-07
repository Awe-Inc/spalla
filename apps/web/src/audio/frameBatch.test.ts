import type { PitchFrame } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { FRAMES_PER_POST, FrameBatch } from "./frameBatch";

function frame(timeSec: number): PitchFrame {
  return { timeSec } as unknown as PitchFrame;
}

describe("FrameBatch", () => {
  it("holds frames until a batch is full and keeps their order", () => {
    const batch = new FrameBatch();
    const sent: PitchFrame[][] = [];
    for (let index = 0; index < FRAMES_PER_POST * 2; index += 1) {
      const full = batch.add(frame(index));
      if (full) sent.push(full);
    }
    expect(sent).toHaveLength(2);
    expect(sent.flat().map((item) => (item as unknown as { timeSec: number }).timeSec)).toEqual(Array.from({ length: FRAMES_PER_POST * 2 }, (_, index) => index));
  });

  it("hands over what is waiting when flushed, once", () => {
    const batch = new FrameBatch();
    expect(batch.add(frame(1))).toBeNull();
    expect(batch.flush()).toHaveLength(1);
    expect(batch.flush()).toEqual([]);
  });
});
