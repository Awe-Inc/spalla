import createFretlessCore from "../dist/fretless_core.js";
import type {
  LivePitchTracker as RawPitchTracker,
  MainModule,
  Session as RawSession,
} from "../dist/fretless_core.js";
import type {
  CurriculumModule,
  Exercise,
  GameStats,
  NoteJudgement,
  ParseOptions,
  ParseResult,
  PitchFrame,
  Score,
  SessionState,
  SimulationConfig,
} from "./types.js";

export * from "./types.js";

export interface CoreLoadOptions {
  wasmBinary?: ArrayBuffer | Uint8Array;
  locateFile?: (path: string, prefix: string) => string;
}

export const DEFAULT_SAMPLE_RATE = 48_000;
export const DEFAULT_WINDOW_SIZE = 2048;

export class PitchTracker {
  readonly #module: MainModule;
  readonly #raw: RawPitchTracker;
  #inputPtr = 0;
  #inputCapacity = 0;

  constructor(module: MainModule, sampleRate: number, windowSize: number) {
    this.#module = module;
    this.#raw = new module.LivePitchTracker(sampleRate, windowSize);
  }

  get requiredSamples(): number {
    return this.#raw.requiredSamples();
  }

  setSilenceThreshold(rms: number): void {
    this.#raw.setSilenceThreshold(rms);
  }

  setConfidenceThreshold(confidence: number): void {
    this.#raw.setConfidenceThreshold(confidence);
  }

  setInputGain(gain: number): void {
    this.#raw.setInputGain(gain);
  }

  process(samples: Float32Array, streamTimeSec: number): PitchFrame {
    if (samples.length > this.#inputCapacity) {
      this.#inputPtr = this.#raw.allocateInput(samples.length);
      this.#inputCapacity = samples.length;
    }
    this.#module.HEAPF32.set(samples, this.#inputPtr >> 2);
    return this.#raw.process(samples.length, streamTimeSec) as PitchFrame;
  }

  dispose(): void {
    this.#raw.delete();
  }
}

export class PracticeSession {
  readonly #raw: RawSession;

  constructor(module: MainModule) {
    this.#raw = new module.Session();
  }

  loadExercise(exerciseId: string, seed = 0): boolean {
    return this.#raw.loadExercise(exerciseId, seed >>> 0);
  }

  loadMusicXml(bytes: Uint8Array, options: ParseOptions = {}): ParseResult {
    return this.#raw.loadMusicXml(bytes, options) as ParseResult;
  }

  setTempoScale(scale: number): void {
    this.#raw.setTempoScale(scale);
  }

  setLeadInSeconds(seconds: number): void {
    this.#raw.setLeadInSeconds(seconds);
  }

  get score(): Score {
    return this.#raw.score() as Score;
  }

  start(): void {
    this.#raw.start();
  }

  pause(): void {
    this.#raw.pause();
  }

  resume(): void {
    this.#raw.resume();
  }

  stop(): void {
    this.#raw.stop();
  }

  restart(): void {
    this.#raw.restart();
  }

  update(deltaSeconds: number, frame: PitchFrame | null): void {
    if (frame === null) {
      this.#raw.updateSilent(deltaSeconds);
      return;
    }
    this.#raw.update(
      deltaSeconds,
      frame.streamTimeSec,
      frame.frequencyHz,
      frame.confidence,
      frame.rmsLinear,
      frame.silent,
    );
  }

  get state(): SessionState {
    return this.#raw.state() as SessionState;
  }

  get songTime(): number {
    return this.#raw.songTime();
  }

  get currentNoteIndex(): number {
    return this.#raw.currentNoteIndex();
  }

  get stats(): GameStats {
    return this.#raw.stats() as GameStats;
  }

  get liveCents(): number | null {
    return this.#raw.liveCents() as number | null;
  }

  get judgements(): NoteJudgement[] {
    return this.#raw.judgements() as NoteJudgement[];
  }

  simulate(config: SimulationConfig = {}): GameStats {
    return this.#raw.simulate(
      config.centsBias ?? 0,
      config.centsJitter ?? 0,
      config.missProbability ?? 0,
      (config.seed ?? 1) >>> 0,
    ) as GameStats;
  }

  dispose(): void {
    this.#raw.delete();
  }
}

export class FretlessCore {
  readonly #module: MainModule;
  #curriculum: CurriculumModule[] | null = null;

  constructor(module: MainModule) {
    this.#module = module;
  }

  get curriculum(): CurriculumModule[] {
    this.#curriculum ??= this.#module.buildCurriculum() as CurriculumModule[];
    return this.#curriculum;
  }

  get exercises(): Exercise[] {
    return this.curriculum.flatMap((module) => module.exercises);
  }

  findExercise(id: string): Exercise | undefined {
    return this.exercises.find((exercise) => exercise.id === id);
  }

  exerciseScore(exerciseId: string, seed = 0): Score | null {
    return this.#module.buildExerciseScore(exerciseId, seed >>> 0) as Score | null;
  }

  parseMusicXml(bytes: Uint8Array, options: ParseOptions = {}): ParseResult {
    return this.#module.parseMusicXml(bytes, options) as ParseResult;
  }

  noteName(midi: number, fifths = 0): string {
    return this.#module.noteName(midi, fifths);
  }

  stringName(index: number): string {
    return this.#module.stringName(index);
  }

  openStringMidi(index: number): number {
    return this.#module.openStringMidi(index);
  }

  midiToFrequency(midi: number): number {
    return this.#module.midiToFrequency(midi);
  }

  centsBetween(frequencyHz: number, referenceHz: number): number {
    return this.#module.centsBetween(frequencyHz, referenceHz);
  }

  createPitchTracker(sampleRate = DEFAULT_SAMPLE_RATE, windowSize = DEFAULT_WINDOW_SIZE): PitchTracker {
    return new PitchTracker(this.#module, sampleRate, windowSize);
  }

  createSession(): PracticeSession {
    return new PracticeSession(this.#module);
  }
}

type InstantiateWasm = (imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance) => void) => Record<string, never>;

function toModuleArg({ wasmBinary, locateFile }: CoreLoadOptions): { locateFile?: CoreLoadOptions["locateFile"]; instantiateWasm?: InstantiateWasm } {
  if (!wasmBinary) return { locateFile };
  const instantiateWasm: InstantiateWasm = (imports, receive) => {
    void WebAssembly.instantiate(wasmBinary as BufferSource, imports).then(({ instance }) => receive(instance));
    return {};
  };
  return { locateFile, instantiateWasm };
}

export async function loadCore(options: CoreLoadOptions = {}): Promise<FretlessCore> {
  const module = await createFretlessCore(toModuleArg(options));
  return new FretlessCore(module);
}

export const coreWasmUrl = typeof URL === "function" ? new URL("../dist/fretless_core.wasm", import.meta.url).href : "";
