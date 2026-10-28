import { describe, expect, it } from "vitest";
import type { Exercise, Score } from "@fretless/core";
import { adviseTempo, clampBpm, tempoLimits, tempoScaleFor } from "./tempo";

const score = { beatsPerMinute: 60, tempoScale: 0.75 } as unknown as Score;

describe("tempoLimits", () => {
  it("recovers the written tempo from a scaled score", () => {
    expect(tempoLimits(score, null).writtenBpm).toBe(80);
  });

  it("uses the exercise range when it has one", () => {
    const exercise = { minBpm: 50, maxBpm: 120 } as unknown as Exercise;
    expect(tempoLimits(score, exercise)).toEqual({ writtenBpm: 80, minBpm: 50, maxBpm: 120 });
  });

  it("derives a range around the written tempo for pieces", () => {
    expect(tempoLimits(score, null)).toEqual({ writtenBpm: 80, minBpm: 32, maxBpm: 120 });
  });
});

describe("tempo helpers", () => {
  const limits = { writtenBpm: 80, minBpm: 40, maxBpm: 120 };

  it("clamps and rounds the requested tempo", () => {
    expect(clampBpm(10, limits)).toBe(40);
    expect(clampBpm(200, limits)).toBe(120);
    expect(clampBpm(66.6, limits)).toBe(67);
  });

  it("turns a tempo into the scale the core expects", () => {
    expect(tempoScaleFor(40, limits)).toBeCloseTo(0.5);
    expect(tempoScaleFor(80, limits)).toBe(1);
  });

  it("suggests slowing down after a rough run", () => {
    expect(adviseTempo(45, 80, limits)).toEqual({ kind: "slow-down", bpm: 70 });
  });

  it("suggests speeding up after a clean run below the written tempo", () => {
    expect(adviseTempo(95, 60, limits)).toEqual({ kind: "speed-up", bpm: 65 });
    expect(adviseTempo(95, 78, limits)).toEqual({ kind: "speed-up", bpm: 80 });
  });

  it("keeps the tempo when nothing stands out", () => {
    expect(adviseTempo(75, 60, limits)).toEqual({ kind: "keep" });
    expect(adviseTempo(95, 80, limits)).toEqual({ kind: "keep" });
    expect(adviseTempo(20, 40, limits)).toEqual({ kind: "keep" });
  });
});
