import { midiToHz } from "./drone";
import { type ListenSound, synthVoice, usesRecordedViolin } from "./listenSounds";

export const SAMPLE_MIDIS = [55, 57, 60, 64, 67, 69, 72, 76, 79, 81, 84, 88, 91, 93, 96] as const;

const SAMPLE_SECONDS = 6;
const LOOP_START_SEC = 1.5;
const LOOP_END_SEC = 5;
const ATTACK_SEC = 0.01;
const RELEASE_SEC = 0.12;
const ARTICULATION_GAP_SEC = 0.03;
const STOP_FADE_SEC = 0.015;

export interface SampleChoice {
  sampleMidi: number;
  playbackRate: number;
}

export interface VoiceEnvelope {
  attackEndSec: number;
  releaseStartSec: number;
  stopSec: number;
}

interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
}

export function nearestSample(midi: number): SampleChoice {
  let sampleMidi: number = SAMPLE_MIDIS[0];
  for (const candidate of SAMPLE_MIDIS) {
    if (Math.abs(candidate - midi) < Math.abs(sampleMidi - midi)) sampleMidi = candidate;
  }
  return { sampleMidi, playbackRate: 2 ** ((midi - sampleMidi) / 12) };
}

export function voiceEnvelope(durationSec: number): VoiceEnvelope {
  const attackEndSec = Math.min(ATTACK_SEC, durationSec / 2);
  const releaseStartSec = Math.max(attackEndSec, durationSec - ARTICULATION_GAP_SEC);
  return { attackEndSec, releaseStartSec, stopSec: releaseStartSec + RELEASE_SEC };
}

export function needsLoop(durationSec: number, playbackRate: number): boolean {
  return (durationSec + RELEASE_SEC) * playbackRate > SAMPLE_SECONDS - 0.5;
}

export function sampleUrl(midi: number, baseUrl: string): string {
  return `${baseUrl}amostras/violino/${midi}.m4a`;
}

const loadedSamples = new WeakMap<BaseAudioContext, Promise<ReadonlyMap<number, AudioBuffer>>>();

async function decodeSample(context: BaseAudioContext, midi: number, baseUrl: string): Promise<[number, AudioBuffer]> {
  const response = await fetch(sampleUrl(midi, baseUrl));
  if (!response.ok) throw new Error(`amostra ${midi}: ${response.status}`);
  return [midi, await context.decodeAudioData(await response.arrayBuffer())];
}

export function loadViolinSamples(context: BaseAudioContext, baseUrl: string): Promise<ReadonlyMap<number, AudioBuffer>> {
  const cached = loadedSamples.get(context);
  if (cached) return cached;
  const loading = Promise.all(SAMPLE_MIDIS.map((midi) => decodeSample(context, midi, baseUrl))).then((entries) => new Map(entries));
  loadedSamples.set(context, loading);
  loading.catch(() => loadedSamples.delete(context));
  return loading;
}

export class ViolinSampler {
  readonly #context: AudioContext;
  readonly #output: GainNode;
  readonly #voices = new Set<Voice>();
  #buffers: ReadonlyMap<number, AudioBuffer> | null = null;
  #sound: ListenSound = "violino";

  constructor(context: AudioContext, volume = 0.6) {
    this.#context = context;
    this.#output = new GainNode(context, { gain: volume });
    this.#output.connect(context.destination);
  }

  get hasSamples(): boolean {
    return this.#buffers !== null;
  }

  async load(baseUrl: string): Promise<boolean> {
    try {
      this.#buffers = await loadViolinSamples(this.#context, baseUrl);
    } catch {
      this.#buffers = null;
    }
    return this.#buffers !== null;
  }

  setSound(sound: ListenSound): void {
    this.#sound = sound;
  }

  setVolume(volume: number): void {
    this.#output.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.#context.currentTime, 0.02);
  }

  playNote(midi: number, atSec: number, durationSec: number): void {
    const envelope = voiceEnvelope(durationSec);
    const gain = new GainNode(this.#context, { gain: 0 });
    gain.gain.setValueAtTime(0, atSec);
    gain.gain.linearRampToValueAtTime(1, atSec + envelope.attackEndSec);
    gain.gain.setValueAtTime(1, atSec + envelope.releaseStartSec);
    gain.gain.linearRampToValueAtTime(0, atSec + envelope.stopSec);
    gain.connect(this.#output);
    const isRecorded = this.#buffers !== null && usesRecordedViolin(this.#sound);
    const source = isRecorded ? this.#sampleSource(midi, durationSec) : this.#synthSource(midi, gain);
    if (isRecorded) source.connect(gain);
    const voice = { source, gain };
    this.#voices.add(voice);
    source.onended = () => {
      this.#voices.delete(voice);
      gain.disconnect();
    };
    source.start(atSec);
    source.stop(atSec + envelope.stopSec + 0.01);
  }

  stopAll(): void {
    const now = this.#context.currentTime;
    for (const { source, gain } of this.#voices) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, STOP_FADE_SEC);
      try {
        source.stop(now + STOP_FADE_SEC * 6);
      } catch {
        continue;
      }
    }
  }

  dispose(): void {
    this.stopAll();
    this.#output.disconnect();
  }

  #sampleSource(midi: number, durationSec: number): AudioBufferSourceNode {
    const { sampleMidi, playbackRate } = nearestSample(midi);
    const source = new AudioBufferSourceNode(this.#context, { buffer: this.#buffers?.get(sampleMidi) ?? null, playbackRate });
    if (needsLoop(durationSec, playbackRate)) {
      source.loop = true;
      source.loopStart = LOOP_START_SEC;
      source.loopEnd = LOOP_END_SEC;
    }
    return source;
  }

  #synthSource(midi: number, gain: GainNode): OscillatorNode {
    const voice = synthVoice(this.#sound);
    const oscillator = new OscillatorNode(this.#context, { type: voice.type, frequency: midiToHz(midi) });
    const filter = new BiquadFilterNode(this.#context, { type: "lowpass", frequency: voice.filterHz, Q: 0.7 });
    const level = new GainNode(this.#context, { gain: voice.level });
    oscillator.connect(filter).connect(level).connect(gain);
    return oscillator;
  }
}
