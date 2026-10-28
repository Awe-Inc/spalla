import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { loadCore, type FretlessCore } from "./index.js";

const fixture = fileURLToPath(new URL("../../../tests/data/backslash_paths.mxl", import.meta.url));

let core: FretlessCore;

beforeAll(async () => {
  core = await loadCore();
});

describe("curriculum", () => {
  it("exposes every module with its exercises", () => {
    expect(core.curriculum.length).toBeGreaterThanOrEqual(9);
    expect(core.exercises.length).toBeGreaterThanOrEqual(160);
    const ids = new Set(core.exercises.map((exercise) => exercise.id));
    expect(ids.size).toBe(core.exercises.length);
  });

  it("builds a score for every playable exercise", () => {
    for (const exercise of core.exercises.filter((item) => item.playable)) {
      const score = core.exerciseScore(exercise.id, 7);
      expect(score, exercise.id).not.toBeNull();
      expect(score!.events.length, exercise.id).toBeGreaterThan(0);
      expect(score!.measures.length, exercise.id).toBeGreaterThan(0);
    }
  });

  it("returns null for an unknown exercise", () => {
    expect(core.exerciseScore("nao-existe")).toBeNull();
  });
});

describe("notes", () => {
  it("names the open strings the way a player does", () => {
    expect(core.noteName(core.openStringMidi(0))).toBe("Sol3");
    expect(core.noteName(core.openStringMidi(1))).toBe("Ré4");
    expect(core.noteName(core.openStringMidi(2))).toBe("Lá4");
    expect(core.noteName(core.openStringMidi(3))).toBe("Mi5");
  });

  it("measures cents between two frequencies", () => {
    expect(core.centsBetween(440, 440)).toBeCloseTo(0, 5);
    expect(core.centsBetween(core.midiToFrequency(70), 440)).toBeCloseTo(100, 3);
  });
});

describe("musicxml", () => {
  it("parses a compressed score from bytes", async () => {
    const bytes = new Uint8Array(await readFile(fixture));
    const result = core.parseMusicXml(bytes);
    expect(result.ok, result.ok ? "" : result.error).toBe(true);
    if (result.ok) {
      expect(result.score.title).toBe("Twinkle, Twinkle, Little Star");
      expect(result.score.noteCount).toBe(42);
      expect(result.score.events[0]?.midi).toBe(69);
    }
  });

  it("rejects garbage with a message instead of throwing", () => {
    const result = core.parseMusicXml(new Uint8Array([1, 2, 3, 4]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

describe("session", () => {
  it("judges every note once when a virtual player performs in tune", () => {
    const session = core.createSession();
    const exercise = core.exercises.find((item) => item.kind === "scale");
    expect(exercise).toBeDefined();
    expect(session.loadExercise(exercise!.id)).toBe(true);
    const noteCount = session.score.noteCount;
    const stats = session.simulate({ centsBias: 0, centsJitter: 2, seed: 3 });
    expect(stats.judgedNotes).toBe(noteCount);
    expect(stats.accuracyPct).toBeGreaterThan(90);
    expect(session.state).toBe("finished");
    const grades = new Set(session.judgements.map((judgement) => judgement.grade));
    expect(grades.size).toBeGreaterThan(0);
    for (const grade of grades) expect(["Perfect", "Great", "Good", "Miss"]).toContain(grade);
    session.dispose();
  });

  it("reports drift with its sign", () => {
    const session = core.createSession();
    const exercise = core.exercises.find((item) => item.kind === "scale");
    session.loadExercise(exercise!.id);
    const stats = session.simulate({ centsBias: -18, centsJitter: 1, seed: 5 });
    expect(stats.meanSignedCents).toBeLessThan(-10);
    session.dispose();
  });
});

describe("pitch tracker", () => {
  it("finds an open A from a synthetic sawtooth", () => {
    const sampleRate = 48_000;
    const tracker = core.createPitchTracker(sampleRate, 2048);
    const block = new Float32Array(128);
    let frame = tracker.process(block, 0);
    const phaseStep = 440 / sampleRate;
    let phase = 0;
    for (let n = 0; n < 40; n += 1) {
      for (let i = 0; i < block.length; i += 1) {
        phase = (phase + phaseStep) % 1;
        block[i] = 0.4 * (2 * phase - 1);
      }
      frame = tracker.process(block, (n * block.length) / sampleRate);
    }
    expect(frame.silent).toBe(false);
    expect(frame.frequencyHz).toBeGreaterThan(437);
    expect(frame.frequencyHz).toBeLessThan(443);
    tracker.dispose();
  });

  it("flags silence", () => {
    const tracker = core.createPitchTracker();
    const frame = tracker.process(new Float32Array(2048), 0);
    expect(frame.silent).toBe(true);
    expect(frame.frequencyHz).toBe(0);
    tracker.dispose();
  });
});

describe("loading inside an AudioWorklet", () => {
  const wasmPath = fileURLToPath(new URL("../dist/fretless_core.wasm", import.meta.url));

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("evaluates and loads from bytes in a scope without URL", async () => {
    const wasmBinary = await readFile(wasmPath);
    vi.stubGlobal("URL", undefined);
    vi.resetModules();
    const worklet = await import("./index.js");
    expect(worklet.coreWasmUrl).toBe("");
    const loaded = await worklet.loadCore({ wasmBinary });
    expect(loaded.noteName(69)).toBe("Lá4");
  });
});

describe("tempo and loop", () => {
  it("treats the tempo scale as absolute, not cumulative", () => {
    const session = core.createSession();
    const exercise = core.exercises.find((item) => item.kind === "scale");
    session.loadExercise(exercise!.id);
    const written = session.score.beatsPerMinute;
    session.setTempoScale(0.5);
    session.setTempoScale(0.5);
    expect(session.score.tempoScale).toBeCloseTo(0.5);
    expect(session.score.beatsPerMinute).toBeCloseTo(written * 0.5);
    session.setTempoScale(1);
    expect(session.score.beatsPerMinute).toBeCloseTo(written);
    session.dispose();
  });

  it("cuts a loop of bars that starts at zero and keeps the tempo", () => {
    const session = core.createSession();
    const exercise = core.exercises.find((item) => item.kind === "scale");
    session.loadExercise(exercise!.id);
    const full = session.score;
    expect(session.measureCount).toBe(full.measures.length);
    expect(full.measures.length).toBeGreaterThan(2);
    session.setTempoScale(0.8);
    expect(session.setMeasureRange({ firstIndex: 1, lastIndex: 2 })).toBe(true);
    const loop = session.score;
    expect(loop.measures.length).toBe(2);
    expect(loop.measures[0]!.startSeconds).toBeCloseTo(0);
    expect(loop.events[0]!.startSeconds).toBeGreaterThanOrEqual(0);
    expect(loop.events.every((event) => event.measureIndex >= 0 && event.measureIndex <= 1)).toBe(true);
    expect(loop.tempoScale).toBeCloseTo(0.8);
    expect(loop.noteCount).toBeLessThan(full.noteCount);
    expect(session.measureRange).toEqual({ firstIndex: 1, lastIndex: 2 });
    const stats = session.simulate({ centsBias: 0, centsJitter: 2, seed: 7 });
    expect(stats.judgedNotes).toBe(loop.noteCount);
    expect(session.setMeasureRange(null)).toBe(false);
    expect(session.score.noteCount).toBe(full.noteCount);
    expect(session.score.tempoScale).toBeCloseTo(0.8);
    session.dispose();
  });
});
