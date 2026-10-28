import { describe, expect, it } from "vitest";

import { clampBpm, clickKindFor, progressiveBpm } from "./tempoClock";

describe("progressiveBpm", () => {
  const plan = { fromBpm: 60, toBpm: 90, stepBpm: 4, everyMeasures: 8 };

  it("steps up every N measures and stops at the target", () => {
    expect(progressiveBpm(plan, 0)).toBe(60);
    expect(progressiveBpm(plan, 7)).toBe(60);
    expect(progressiveBpm(plan, 8)).toBe(64);
    expect(progressiveBpm(plan, 16)).toBe(68);
    expect(progressiveBpm(plan, 800)).toBe(90);
  });

  it("can also slow down toward a lower target", () => {
    expect(progressiveBpm({ fromBpm: 100, toBpm: 80, stepBpm: 10, everyMeasures: 2 }, 2)).toBe(90);
    expect(progressiveBpm({ fromBpm: 100, toBpm: 80, stepBpm: 10, everyMeasures: 2 }, 40)).toBe(80);
  });
});

describe("clickKindFor", () => {
  it("accents only the first beat when asked and marks subdivisions", () => {
    expect(clickKindFor(0, 0, true)).toBe("downbeat");
    expect(clickKindFor(0, 0, false)).toBe("beat");
    expect(clickKindFor(2, 0, true)).toBe("beat");
    expect(clickKindFor(2, 1, true)).toBe("subdivision");
  });
});

describe("clampBpm", () => {
  it("keeps the tempo inside the dial", () => {
    expect(clampBpm(10)).toBe(30);
    expect(clampBpm(999)).toBe(240);
    expect(clampBpm(72.6)).toBe(73);
  });
});
