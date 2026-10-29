import type { Score } from "@fretless/core";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LISTEN_LEAD_SEC, useListen } from "./useListen";

const played: { midi: number; atSec: number; durSec: number }[] = [];
const sampler = { stopped: 0 };
const clock = { now: 10 };

vi.mock("./violinSampler", () => ({
  ViolinSampler: class {
    hasSamples = false;
    async load(): Promise<boolean> {
      this.hasSamples = true;
      return true;
    }
    playNote(midi: number, atSec: number, durSec: number): void {
      played.push({ midi, atSec, durSec });
    }
    stopAll(): void {
      sampler.stopped += 1;
    }
    setVolume(): void {}
    dispose(): void {}
  },
}));

vi.mock("./metronome", () => ({
  Metronome: class {
    setTrack(): void {}
    setEnabled(): void {}
    setVolume(): void {}
    setSound(): void {}
    sync(): void {}
    rewind(): void {}
    dispose(): void {}
  },
}));

class FakeAudioContext {
  get currentTime(): number {
    return clock.now;
  }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

const score = scoreOf();

function scoreOf(): Score {
  const events = [0, 1, 2, 3].map((index) => ({ midi: 67 + index, startSeconds: index, durationSeconds: 1, measureIndex: Math.floor(index / 2), isRest: false, isTiedFrom: false }));
  const measures = [0, 1].map((index) => ({ startSeconds: index * 2, endSeconds: (index + 1) * 2, beats: 2, beatUnit: 4, beatOffset: 0, lengthQuarters: 2, startQuarters: index * 2, number: index + 1 }));
  return { events, measures, durationSeconds: 4, beatsPerMinute: 60 } as unknown as Score;
}

describe("useListen", () => {
  beforeEach(() => {
    played.length = 0;
    sampler.stopped = 0;
    clock.now = 10;
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("schedules the notes inside the look-ahead window, after the lead-in, on the audio clock", async () => {
    const { result } = renderHook(() => useListen(score));

    await act(() => result.current.play());

    expect(result.current.status).toBe("tocando");
    expect(played.map((note) => note.midi)).toEqual([67, 68]);
    expect(played[0]?.atSec).toBeCloseTo(10 + LISTEN_LEAD_SEC);
  });

  it("plays only the excerpt, starting at its first bar", async () => {
    const { result } = renderHook(() => useListen(score));

    await act(() => result.current.play({ firstIndex: 1, lastIndex: 1 }));

    expect(played.map((note) => note.midi)).toEqual([69, 70]);
    expect(played[0]?.atSec).toBeCloseTo(10 + LISTEN_LEAD_SEC);
  });

  it("goes back to idle when the audio output cannot start", async () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("sem saída de áudio");
        }
      },
    );
    const { result } = renderHook(() => useListen(score));

    await act(() => result.current.play());

    expect(result.current.status).toBe("parado");
    expect(played).toEqual([]);
  });

  it("silences the violin and resets when stopped", async () => {
    const { result } = renderHook(() => useListen(score));
    await act(() => result.current.play());

    act(() => result.current.stop());

    expect(result.current.status).toBe("parado");
    expect(sampler.stopped).toBeGreaterThan(0);
    expect(result.current.songTime).toBe(-LISTEN_LEAD_SEC);
  });
});
