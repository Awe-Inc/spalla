import type { PitchFrame } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { OnsetDetector, summarize, verdict } from "./latency";

function frame(rms: number, time: number): PitchFrame {
  return { streamTimeSec: time, blockIndex: 0, frequencyHz: 0, confidence: 0, rmsLinear: rms, silent: rms < 0.0025, lowConfidence: true, clipped: false };
}

describe("OnsetDetector", () => {
  it("fires once per burst and re-arms after silence", () => {
    const detector = new OnsetDetector();
    expect(detector.feed(frame(0.001, 0))).toBeNull();
    expect(detector.feed(frame(0.3, 0.01))).toBe(0.01);
    expect(detector.feed(frame(0.3, 0.02))).toBeNull();
    expect(detector.feed(frame(0.005, 0.03))).toBeNull();
    expect(detector.feed(frame(0.3, 0.04))).toBe(0.04);
  });

  it("ignores a burst below the click threshold", () => {
    const detector = new OnsetDetector();
    expect(detector.feed(frame(0.02, 0.01))).toBeNull();
  });
});

describe("summarize", () => {
  it("returns null without samples", () => {
    expect(summarize([])).toBeNull();
  });

  it("computes mean and jitter in milliseconds", () => {
    const report = summarize([
      { clickAtSec: 1, heardAtSec: 1.02 },
      { clickAtSec: 2, heardAtSec: 2.024 },
      { clickAtSec: 3, heardAtSec: 3.016 },
    ]);
    expect(report?.meanMs).toBeCloseTo(20, 5);
    expect(report?.jitterMs).toBeCloseTo(3.266, 2);
    expect(report?.minMs).toBeCloseTo(16, 5);
    expect(report?.maxMs).toBeCloseTo(24, 5);
  });
});

describe("verdict", () => {
  it("approves at most 30 ms with under 5 ms of jitter", () => {
    expect(verdict({ samples: 10, meanMs: 28, jitterMs: 3, minMs: 24, maxMs: 33 })).toBe("aprovado");
    expect(verdict({ samples: 10, meanMs: 28, jitterMs: 7, minMs: 20, maxMs: 40 })).toBe("limite");
    expect(verdict({ samples: 10, meanMs: 60, jitterMs: 2, minMs: 58, maxMs: 62 })).toBe("reprovado");
  });
});
