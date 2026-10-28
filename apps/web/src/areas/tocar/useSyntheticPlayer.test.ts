import type { PitchFrame, PracticeSession } from "@fretless/core";
import { describe, expect, it, vi } from "vitest";

import { advanceWithSyntheticPlayer, isSyntheticPlayerRequested } from "./useSyntheticPlayer";

function frameAt(streamTimeSec: number): PitchFrame {
  return { streamTimeSec, blockIndex: 0, frequencyHz: 440, confidence: 0.95, rmsLinear: 0.06, silent: false, lowConfidence: false, clipped: false };
}

describe("isSyntheticPlayerRequested", () => {
  it("only answers to the query when the build flag is on", () => {
    const requested = new URLSearchParams("jogador=sintetico");
    expect(isSyntheticPlayerRequested(requested, "1")).toBe(true);
    expect(isSyntheticPlayerRequested(requested, undefined)).toBe(false);
    expect(isSyntheticPlayerRequested(requested, "0")).toBe(false);
    expect(isSyntheticPlayerRequested(new URLSearchParams(""), "1")).toBe(false);
    expect(isSyntheticPlayerRequested(new URLSearchParams("jogador=eu"), "1")).toBe(false);
  });
});

describe("advanceWithSyntheticPlayer", () => {
  it("moves the clock in silence, then feeds the frames synthesized for that stretch with no extra time", () => {
    let songTime = 1;
    const frames = [frameAt(1.004), frameAt(1.009)];
    const update = vi.fn((deltaSeconds: number) => {
      songTime += deltaSeconds;
    });
    const synthesize = vi.fn(() => frames);
    const session = {
      get songTime() {
        return songTime;
      },
      update,
      synthesize,
    } as unknown as PracticeSession;

    const produced = advanceWithSyntheticPlayer(session, 0.016);

    expect(produced).toBe(frames);
    expect(synthesize).toHaveBeenCalledWith(1, 1.016);
    expect(update.mock.calls).toEqual([[0.016, null], [0, frames[0]], [0, frames[1]]]);
  });
});
