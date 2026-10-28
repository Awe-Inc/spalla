import type { Click, ClickKind } from "./clickTrack";
import { clicksBetween } from "./clickTrack";

export type ClickSound = "madeira" | "digital" | "suave";

export const CLICK_SOUNDS: Record<ClickSound, { label: string; type: OscillatorType; frequencyHz: number; durationSec: number }> = {
  madeira: { label: "Madeira", type: "triangle", frequencyHz: 1800, durationSec: 0.03 },
  digital: { label: "Digital", type: "square", frequencyHz: 1000, durationSec: 0.02 },
  suave: { label: "Suave", type: "sine", frequencyHz: 880, durationSec: 0.05 },
};

const ACCENT: Record<ClickKind, { pitchFactor: number; gainFactor: number }> = {
  downbeat: { pitchFactor: 1.5, gainFactor: 1 },
  beat: { pitchFactor: 1, gainFactor: 0.8 },
  subdivision: { pitchFactor: 0.75, gainFactor: 0.35 },
};

export const LOOKAHEAD_SEC = 0.12;

export function scheduleClick(context: AudioContext, destination: AudioNode, atSec: number, kind: ClickKind, sound: ClickSound): void {
  const voice = CLICK_SOUNDS[sound];
  const accent = ACCENT[kind];
  const oscillator = new OscillatorNode(context, { type: voice.type, frequency: voice.frequencyHz * accent.pitchFactor });
  const gain = new GainNode(context, { gain: 0 });
  gain.gain.setValueAtTime(accent.gainFactor, atSec);
  gain.gain.exponentialRampToValueAtTime(0.001, atSec + voice.durationSec);
  oscillator.connect(gain).connect(destination);
  oscillator.start(atSec);
  oscillator.stop(atSec + voice.durationSec + 0.01);
}

export class Metronome {
  readonly #context: AudioContext;
  readonly #output: GainNode;
  #track: readonly Click[] = [];
  #cursorSec = Number.NEGATIVE_INFINITY;
  #sound: ClickSound = "madeira";
  #enabled = false;

  constructor(context: AudioContext, volume = 0.5) {
    this.#context = context;
    this.#output = new GainNode(context, { gain: volume });
    this.#output.connect(context.destination);
  }

  setTrack(track: readonly Click[]): void {
    this.#track = track;
  }

  setSound(sound: ClickSound): void {
    this.#sound = sound;
  }

  setVolume(volume: number): void {
    this.#output.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.#context.currentTime, 0.02);
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  rewind(songTimeSec: number): void {
    this.#cursorSec = songTimeSec;
  }

  sync(songTimeSec: number): void {
    if (!this.#enabled) {
      this.#cursorSec = songTimeSec;
      return;
    }
    if (this.#cursorSec === Number.NEGATIVE_INFINITY || songTimeSec < this.#cursorSec) this.#cursorSec = songTimeSec;
    const horizon = songTimeSec + LOOKAHEAD_SEC;
    for (const click of clicksBetween(this.#track, this.#cursorSec, horizon)) {
      const atSec = this.#context.currentTime + (click.timeSec - songTimeSec);
      scheduleClick(this.#context, this.#output, Math.max(atSec, this.#context.currentTime), click.kind, this.#sound);
    }
    this.#cursorSec = horizon;
  }

  dispose(): void {
    this.#output.disconnect();
  }
}
