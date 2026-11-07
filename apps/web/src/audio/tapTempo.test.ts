import { describe, expect, it } from "vitest";

import { addTap, bpmFromTaps } from "./tapTempo";

describe("addTap", () => {
  it("starts over after a long pause", () => {
    expect(addTap([1000], 3000)).toEqual([1000, 3000]);
    expect(addTap([1000], 3001)).toEqual([3001]);
  });

  it("keeps only the latest taps", () => {
    expect(addTap([1, 2, 3, 4, 5, 6], 7)).toEqual([2, 3, 4, 5, 6, 7]);
  });
});

describe("bpmFromTaps", () => {
  it("needs two different taps", () => {
    expect(bpmFromTaps([])).toBeNull();
    expect(bpmFromTaps([1000])).toBeNull();
    expect(bpmFromTaps([1000, 1000])).toBeNull();
  });

  it("averages the intervals", () => {
    expect(bpmFromTaps([0, 500, 1000, 1500])).toBe(120);
    expect(bpmFromTaps([0, 400, 1000])).toBe(120);
  });

  it("stays inside the range of the metronome", () => {
    expect(bpmFromTaps([0, 10])).toBeLessThanOrEqual(300);
    expect(bpmFromTaps([0, 2000])).toBeGreaterThanOrEqual(20);
  });
});
