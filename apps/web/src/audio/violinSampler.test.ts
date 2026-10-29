import { describe, expect, it } from "vitest";
import { nearestSample, needsLoop, sampleUrl, SAMPLE_MIDIS, voiceEnvelope } from "./violinSampler";

describe("nearestSample", () => {
  it("plays a recorded note at its own speed", () => {
    for (const midi of SAMPLE_MIDIS) expect(nearestSample(midi)).toEqual({ sampleMidi: midi, playbackRate: 1 });
  });

  it("bends the open G up to G#3 and keeps the lowest sample below it", () => {
    expect(nearestSample(56).sampleMidi).toBe(55);
    expect(nearestSample(56).playbackRate).toBeCloseTo(2 ** (1 / 12));
    expect(nearestSample(53).playbackRate).toBeCloseTo(2 ** (-2 / 12));
  });

  it("reaches the top of the range from C7", () => {
    expect(nearestSample(98)).toEqual({ sampleMidi: 96, playbackRate: 2 ** (2 / 12) });
  });

  it("never stretches a note in first position by more than two semitones", () => {
    for (let midi = 55; midi <= 96; midi += 1) {
      expect(Math.abs(midi - nearestSample(midi).sampleMidi)).toBeLessThanOrEqual(2);
    }
  });
});

describe("voiceEnvelope", () => {
  it("leaves a short gap before the next note and releases after it", () => {
    const envelope = voiceEnvelope(1);
    expect(envelope.attackEndSec).toBeCloseTo(0.01);
    expect(envelope.releaseStartSec).toBeCloseTo(0.97);
    expect(envelope.stopSec).toBeCloseTo(1.09);
  });

  it("keeps a very short note ordered", () => {
    const envelope = voiceEnvelope(0.01);
    expect(envelope.attackEndSec).toBeLessThanOrEqual(envelope.releaseStartSec);
    expect(envelope.releaseStartSec).toBeLessThan(envelope.stopSec);
  });
});

describe("needsLoop", () => {
  it("loops only notes longer than the recording", () => {
    expect(needsLoop(2, 1)).toBe(false);
    expect(needsLoop(6, 1)).toBe(true);
    expect(needsLoop(4.8, 1.2)).toBe(true);
  });
});

describe("sampleUrl", () => {
  it("follows the base path of the build", () => {
    expect(sampleUrl(69, "/fretless/")).toBe("/fretless/amostras/violino/69.m4a");
  });
});
