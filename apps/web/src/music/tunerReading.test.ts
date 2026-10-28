import type { FretlessCore, PitchFrame } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { midiFromFrequency, tunerReading } from "./tunerReading";

const fakeCore = {
  noteName: (midi: number) => (midi === 69 ? "A4" : `M${midi}`),
  midiToFrequency: (midi: number) => 440 * 2 ** ((midi - 69) / 12),
  centsBetween: (hz: number, reference: number) => 1200 * Math.log2(hz / reference),
} as unknown as FretlessCore;

function frame(overrides: Partial<PitchFrame>): PitchFrame {
  return { streamTimeSec: 0, blockIndex: 0, frequencyHz: 440, confidence: 0.9, rmsLinear: 0.1, silent: false, lowConfidence: false, clipped: false, ...overrides } as PitchFrame;
}

describe("tunerReading", () => {
  it("names the note in the chosen naming and measures the cents", () => {
    const reading = tunerReading(fakeCore, frame({ frequencyHz: 445 }), "latin");
    expect(reading?.midi).toBe(69);
    expect(reading?.note).toBe("Lá4");
    expect(reading?.cents).toBeCloseTo(19.6, 0);
  });

  it("returns null without a frame, in silence, with low confidence or with a non-positive frequency", () => {
    expect(tunerReading(fakeCore, null, "latin")).toBeNull();
    expect(tunerReading(fakeCore, frame({ silent: true, frequencyHz: 0 }), "latin")).toBeNull();
    expect(tunerReading(fakeCore, frame({ lowConfidence: true }), "latin")).toBeNull();
    expect(tunerReading(fakeCore, frame({ frequencyHz: 0 }), "latin")).toBeNull();
  });

  it("rounds a frequency to the nearest midi note", () => {
    expect(midiFromFrequency(440)).toBe(69);
    expect(midiFromFrequency(466)).toBe(70);
    expect(midiFromFrequency(196)).toBe(55);
  });
});
