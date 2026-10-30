import type { PitchFrame } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { addFrame, EMPTY_MIC_CHECK, type MicCheck, micAdvice, readRatio, toDecibels } from "./micCheck";

function frame(overrides: Partial<PitchFrame> = {}): PitchFrame {
  return { streamTimeSec: 0, blockIndex: 0, frequencyHz: 440, confidence: 0.9, rmsLinear: 0.05, silent: false, lowConfidence: false, clipped: false, ...overrides };
}

function feed(frames: PitchFrame[], start: MicCheck = EMPTY_MIC_CHECK): MicCheck {
  return frames.reduce(addFrame, start);
}

describe("addFrame", () => {
  it("counts sound, readable frames, the loudest block and the highest note", () => {
    const check = feed([frame({ frequencyHz: 660 }), frame({ lowConfidence: true, frequencyHz: 0, rmsLinear: 0.2 }), frame({ silent: true, frequencyHz: 0 })]);
    expect(check).toEqual({ soundFrames: 2, readFrames: 1, peakRms: 0.2, noiseFloor: 0, highestHz: 660 });
  });

  it("keeps the last noise floor the tracker reported", () => {
    expect(feed([frame({ noiseFloor: 0.004 }), frame()]).noiseFloor).toBe(0.004);
  });

  it("does not mutate the previous check", () => {
    const before = { ...EMPTY_MIC_CHECK };
    addFrame(before, frame());
    expect(before).toEqual(EMPTY_MIC_CHECK);
  });
});

describe("toDecibels", () => {
  it("floors silence instead of returning minus infinity", () => {
    expect(toDecibels(0)).toBe(-90);
    expect(toDecibels(0.1)).toBeCloseTo(-20, 5);
  });
});

describe("micAdvice", () => {
  it("asks for notes before it has enough sound", () => {
    expect(readRatio(feed([frame()]))).toBeNull();
    expect(micAdvice(feed([frame()]))).toEqual(["Toque algumas notas para o teste medir."]);
  });

  it("flags a microphone that hears sound but reads few notes", () => {
    const check = feed(Array.from({ length: 50 }, (_, i) => frame(i % 2 ? { lowConfidence: true, frequencyHz: 0 } : { frequencyHz: 300 })).concat(Array.from({ length: 10 }, () => frame({ lowConfidence: true, frequencyHz: 0 }))));
    expect(micAdvice(check)[0]).toContain("poucas notas são lidas");
  });

  it("asks for a high note until one is read", () => {
    const low = feed(Array.from({ length: 50 }, () => frame({ frequencyHz: 440 })));
    expect(micAdvice(low)[0]).toContain("nota aguda");
    const high = feed([frame({ frequencyHz: 2637 })], low);
    expect(micAdvice(high)[0]).toContain("inclusive as notas agudas");
  });

  it("warns about a noisy room alongside the reading advice", () => {
    const check = feed(Array.from({ length: 50 }, () => frame({ noiseFloor: 0.02 })));
    expect(micAdvice(check)).toHaveLength(2);
    expect(micAdvice(check)[0]).toContain("barulhento");
  });
});
