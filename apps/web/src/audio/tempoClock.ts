import type { ClickKind, Subdivision } from "./clickTrack";
import { type ClickSound, LOOKAHEAD_SEC, scheduleClick } from "./metronome";

export interface ProgressivePlan {
  fromBpm: number;
  toBpm: number;
  stepBpm: number;
  everyMeasures: number;
}

export interface TempoClockSettings {
  bpm: number;
  beatsPerMeasure: number;
  subdivision: Subdivision;
  accentFirstBeat: boolean;
  sound: ClickSound;
  progressive: ProgressivePlan | null;
}

export const TEMPO_MIN_BPM = 30;
export const TEMPO_MAX_BPM = 240;
const SCHEDULER_INTERVAL_MS = 25;

export function clampBpm(bpm: number): number {
  return Math.max(TEMPO_MIN_BPM, Math.min(TEMPO_MAX_BPM, Math.round(bpm)));
}

export function progressiveBpm(plan: ProgressivePlan, measureIndex: number): number {
  const steps = Math.floor(Math.max(0, measureIndex) / Math.max(1, plan.everyMeasures));
  const raw = plan.fromBpm + steps * plan.stepBpm;
  return plan.toBpm >= plan.fromBpm ? Math.min(plan.toBpm, raw) : Math.max(plan.toBpm, plan.fromBpm - steps * plan.stepBpm);
}

export function clickKindFor(beatIndex: number, tick: number, accentFirstBeat: boolean): ClickKind {
  if (tick !== 0) return "subdivision";
  return beatIndex === 0 && accentFirstBeat ? "downbeat" : "beat";
}

export class TempoClock {
  readonly #context: AudioContext;
  readonly #output: GainNode;
  #settings: TempoClockSettings;
  #timer: ReturnType<typeof setInterval> | null = null;
  #nextTickSec = 0;
  #beatIndex = 0;
  #tick = 0;
  #measureIndex = 0;
  #onMeasure: ((measureIndex: number, bpm: number) => void) | null = null;

  constructor(settings: TempoClockSettings, volume = 0.6) {
    this.#context = new AudioContext();
    this.#output = new GainNode(this.#context, { gain: volume });
    this.#output.connect(this.#context.destination);
    this.#settings = settings;
  }

  get isRunning(): boolean {
    return this.#timer !== null;
  }

  get currentBpm(): number {
    const plan = this.#settings.progressive;
    return plan ? progressiveBpm(plan, this.#measureIndex) : this.#settings.bpm;
  }

  onMeasure(callback: ((measureIndex: number, bpm: number) => void) | null): void {
    this.#onMeasure = callback;
  }

  update(settings: TempoClockSettings): void {
    this.#settings = settings;
  }

  setVolume(volume: number): void {
    this.#output.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.#context.currentTime, 0.02);
  }

  async start(): Promise<void> {
    if (this.#timer !== null) return;
    await this.#context.resume();
    this.#beatIndex = 0;
    this.#tick = 0;
    this.#measureIndex = 0;
    this.#nextTickSec = this.#context.currentTime + 0.05;
    this.#onMeasure?.(0, this.currentBpm);
    this.#timer = setInterval(() => this.#schedule(), SCHEDULER_INTERVAL_MS);
  }

  stop(): void {
    if (this.#timer === null) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  async dispose(): Promise<void> {
    this.stop();
    await this.#context.close();
  }

  #schedule(): void {
    const horizon = this.#context.currentTime + LOOKAHEAD_SEC;
    while (this.#nextTickSec < horizon) {
      const { beatsPerMeasure, subdivision, accentFirstBeat, sound } = this.#settings;
      scheduleClick(this.#context, this.#output, this.#nextTickSec, clickKindFor(this.#beatIndex, this.#tick, accentFirstBeat), sound);
      this.#nextTickSec += 60 / this.currentBpm / subdivision;
      this.#tick = (this.#tick + 1) % subdivision;
      if (this.#tick === 0) {
        this.#beatIndex = (this.#beatIndex + 1) % beatsPerMeasure;
        if (this.#beatIndex === 0) {
          this.#measureIndex += 1;
          this.#onMeasure?.(this.#measureIndex, this.currentBpm);
        }
      }
    }
  }
}
