import type { FretlessCore, PitchFrame } from "@fretless/core";

import type { NoteNaming } from "@/app/settings";

import { displayNoteName } from "./noteNames";

export interface TunerReading {
  midi: number;
  note: string;
  cents: number;
  frequencyHz: number;
}

export function midiFromFrequency(frequencyHz: number): number {
  return Math.round(69 + 12 * Math.log2(frequencyHz / 440));
}

export function tunerReading(core: FretlessCore, frame: PitchFrame | null, naming: NoteNaming): TunerReading | null {
  if (!frame || frame.silent || frame.lowConfidence || frame.frequencyHz <= 0) return null;
  const midi = midiFromFrequency(frame.frequencyHz);
  return {
    midi,
    note: displayNoteName(core.noteName(midi), naming),
    cents: core.centsBetween(frame.frequencyHz, core.midiToFrequency(midi)),
    frequencyHz: frame.frequencyHz,
  };
}
