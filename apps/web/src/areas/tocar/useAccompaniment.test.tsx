import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PitchInput } from "@/audio/PitchInput";

import { useAccompaniment } from "./useAccompaniment";

const started: number[] = [];

vi.mock("@/audio/drone", () => ({
  Drone: class {
    midi: number | null = null;
    start(midi: number): void {
      this.midi = midi;
      started.push(midi);
    }
    stop(): void {
      this.midi = null;
    }
    setVolume(): void {}
    dispose(): void {}
  },
}));

vi.mock("@/audio/metronome", () => ({
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

const input = { context: {} } as unknown as PitchInput;

describe("useAccompaniment", () => {
  it("plays the pedal note asked for before the microphone finished starting", () => {
    const props = { input, isListening: false, score: null, leadInSeconds: 1, droneMidi: 69 };
    const { result, rerender } = renderHook((current: typeof props) => useAccompaniment(current), { initialProps: props });

    act(() => result.current.startDrone());
    expect(started).toEqual([]);

    rerender({ ...props, isListening: true });
    expect(started).toEqual([69]);
  });
});
