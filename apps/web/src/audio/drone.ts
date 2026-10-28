export const DRONE_A4_MIDI = 69;

const FADE_SEC = 0.25;

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class Drone {
  readonly #context: AudioContext;
  readonly #output: GainNode;
  #voices: OscillatorNode[] = [];
  #midi: number | null = null;

  constructor(context: AudioContext, volume = 0.35) {
    this.#context = context;
    this.#output = new GainNode(context, { gain: 0 });
    const filter = new BiquadFilterNode(context, { type: "lowpass", frequency: 1400, Q: 0.7 });
    this.#output.connect(filter).connect(context.destination);
    this.#targetVolume = volume;
  }

  #targetVolume: number;

  get midi(): number | null {
    return this.#midi;
  }

  setVolume(volume: number): void {
    this.#targetVolume = Math.max(0, Math.min(1, volume));
    if (this.#midi !== null) this.#output.gain.setTargetAtTime(this.#targetVolume, this.#context.currentTime, 0.05);
  }

  start(midi: number): void {
    if (this.#midi === midi) return;
    this.#silence();
    const now = this.#context.currentTime;
    const fundamental = midiToHz(midi);
    this.#voices = [
      new OscillatorNode(this.#context, { type: "sawtooth", frequency: fundamental }),
      new OscillatorNode(this.#context, { type: "sine", frequency: fundamental * 2 }),
    ];
    const partialGain = new GainNode(this.#context, { gain: 0.25 });
    this.#voices[0]?.connect(this.#output);
    this.#voices[1]?.connect(partialGain).connect(this.#output);
    this.#voices.forEach((voice) => voice.start(now));
    this.#output.gain.cancelScheduledValues(now);
    this.#output.gain.setValueAtTime(0, now);
    this.#output.gain.linearRampToValueAtTime(this.#targetVolume, now + FADE_SEC);
    this.#midi = midi;
  }

  stop(): void {
    this.#silence();
  }

  #silence(): void {
    const now = this.#context.currentTime;
    this.#output.gain.cancelScheduledValues(now);
    this.#output.gain.setValueAtTime(this.#output.gain.value, now);
    this.#output.gain.linearRampToValueAtTime(0, now + FADE_SEC);
    for (const voice of this.#voices) voice.stop(now + FADE_SEC + 0.01);
    this.#voices = [];
    this.#midi = null;
  }

  dispose(): void {
    this.#silence();
    this.#output.disconnect();
  }
}
