import { describe, expect, it } from "vitest";

import { isListenSound, LISTEN_SOUND_OPTIONS, LISTEN_SOUNDS, synthVoice, usesRecordedViolin } from "./listenSounds";

describe("listenSounds", () => {
  it("offers every sound once on screen", () => {
    expect(LISTEN_SOUND_OPTIONS.map((option) => option.value)).toEqual([...LISTEN_SOUNDS]);
  });

  it("only the violin uses the recorded samples", () => {
    expect(LISTEN_SOUNDS.filter(usesRecordedViolin)).toEqual(["violino"]);
  });

  it("falls back from the violin to the synthesized string", () => {
    expect(synthVoice("violino")).toEqual(synthVoice("sintetizado"));
  });

  it("gives each synthesized sound its own waveform", () => {
    expect(new Set(["sintetizado", "suave", "puro"].map((sound) => synthVoice(sound as "puro").type)).size).toBe(3);
  });

  it("rejects a stored value it does not know", () => {
    expect(isListenSound("piano")).toBe(false);
    expect(isListenSound("puro")).toBe(true);
  });
});
