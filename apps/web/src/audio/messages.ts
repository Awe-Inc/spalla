import type { PitchFrame } from "@fretless/core";

export interface WorkletOptions {
  wasmBinary: ArrayBuffer;
  windowSize: number;
  hopFrames?: number;
}

export type WorkletInbound = { type: "stop" } | { type: "gain"; value: number };

export type WorkletOutbound =
  | { type: "ready"; requiredSamples: number; sampleRate: number }
  | { type: "frame"; frame: PitchFrame }
  | { type: "error"; message: string };
