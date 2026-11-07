import { coreWasmUrl, DEFAULT_WINDOW_SIZE, type PitchFrame } from "@fretless/core";

import type { WorkletOptions, WorkletOutbound } from "./messages";
import { activeProcessing, type BrowserProcessing } from "./micProcessing";
import workletUrl from "./pitch-worklet.ts?worker&url";

export type FrameListener = (frame: PitchFrame) => void;

const READY_TIMEOUT_MS = 10_000;
const SUSPEND_AFTER_STOP_MS = 1_000;

export interface PitchInputInfo {
  sampleRate: number;
  baseLatencySec: number;
  outputLatencySec: number;
  requiredSamples: number;
  browserProcessing: BrowserProcessing[];
}

export class PitchInputCancelled extends Error {
  constructor() {
    super("A captura foi encerrada antes de ficar pronta.");
    this.name = "PitchInputCancelled";
  }
}

interface CompiledCore {
  wasmModule: WebAssembly.Module;
  wasmBinary: ArrayBuffer;
}

let compiledCore: Promise<CompiledCore> | null = null;

async function fetchAndCompileCore(): Promise<CompiledCore> {
  const response = await fetch(coreWasmUrl);
  if (!response.ok) throw new Error(`O núcleo não carregou (HTTP ${response.status}).`);
  const wasmBinary = await response.arrayBuffer();
  return { wasmModule: await WebAssembly.compile(wasmBinary), wasmBinary };
}

function compileCoreOnce(): Promise<CompiledCore> {
  compiledCore ??= fetchAndCompileCore().catch((error: unknown) => {
    compiledCore = null;
    throw error;
  });
  return compiledCore;
}

export function forgetCompiledCore(): void {
  compiledCore = null;
}

function isCloneFailure(error: unknown): boolean {
  return error instanceof DOMException && error.name === "DataCloneError";
}

function createPitchNode(context: AudioContext, core: CompiledCore, windowSize: number): AudioWorkletNode {
  const build = (processorOptions: WorkletOptions) => new AudioWorkletNode(context, "fretless-pitch", { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, processorOptions });
  try {
    return build({ wasmModule: core.wasmModule, windowSize });
  } catch (error: unknown) {
    if (!isCloneFailure(error)) throw error;
    return build({ wasmBinary: core.wasmBinary, windowSize });
  }
}

export class PitchInput {
  #context: AudioContext | null = null;
  #idleContext: AudioContext | null = null;
  #workletLoad: Promise<void> | null = null;
  #suspendTimer: ReturnType<typeof setTimeout> | null = null;
  #stream: MediaStream | null = null;
  #node: AudioWorkletNode | null = null;
  #listeners = new Set<FrameListener>();
  #generation = 0;
  #gain = 1;

  get context(): AudioContext | null {
    return this.#context;
  }

  get isOpen(): boolean {
    return this.#context !== null;
  }

  setGain(value: number): void {
    this.#gain = value;
    this.#node?.port.postMessage({ type: "gain", value });
  }

  onFrame(listener: FrameListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async start(deviceId: string | null, windowSize = DEFAULT_WINDOW_SIZE): Promise<PitchInputInfo> {
    await this.stop();
    const generation = ++this.#generation;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    if (generation !== this.#generation) {
      this.#release(stream, null);
      throw new PitchInputCancelled();
    }
    const context = this.#takeContext();
    this.#context = context;
    this.#stream = stream;
    let startedNode: AudioWorkletNode | null = null;
    try {
      const [core] = await Promise.all([compileCoreOnce(), this.#loadWorklet(context)]);
      if (generation !== this.#generation) throw new PitchInputCancelled();
      const node = createPitchNode(context, core, windowSize);
      startedNode = node;
      this.#node = node;
      context.createMediaStreamSource(stream).connect(node);

      const ready = new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("O analisador de afinação não respondeu. Recarregue a página e tente de novo.")), READY_TIMEOUT_MS);
        node.port.onmessage = (event: MessageEvent<WorkletOutbound>) => {
          const message = event.data;
          if (message.type === "ready") {
            clearTimeout(timer);
            resolve(message.requiredSamples);
          }
          if (message.type === "error") {
            clearTimeout(timer);
            reject(new Error(message.message));
          }
          if (message.type === "frames") {
            for (const frame of message.frames) {
              for (const listener of this.#listeners) listener(frame);
            }
          }
        };
      });

      await context.resume();
      const requiredSamples = await ready;
      if (generation !== this.#generation) throw new PitchInputCancelled();
      node.port.postMessage({ type: "gain", value: this.#gain });
      return {
        sampleRate: context.sampleRate,
        baseLatencySec: context.baseLatency,
        outputLatencySec: context.outputLatency ?? 0,
        requiredSamples,
        browserProcessing: activeProcessing(stream.getAudioTracks()[0]?.getSettings() ?? {}),
      };
    } catch (error: unknown) {
      this.#release(stream, startedNode);
      if (generation === this.#generation) {
        this.#context = null;
        this.#stream = null;
        this.#node = null;
        this.#park(context);
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#generation += 1;
    const context = this.#context;
    const stream = this.#stream;
    const node = this.#node;
    this.#context = null;
    this.#stream = null;
    this.#node = null;
    this.#release(stream, node);
    if (context) this.#park(context);
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.#cancelSuspend();
    const context = this.#idleContext;
    this.#idleContext = null;
    this.#workletLoad = null;
    if (context && context.state !== "closed") await context.close();
  }

  #takeContext(): AudioContext {
    this.#cancelSuspend();
    const idle = this.#idleContext;
    if (idle && idle.state !== "closed") return idle;
    this.#workletLoad = null;
    return new AudioContext({ latencyHint: "interactive" });
  }

  #loadWorklet(context: AudioContext): Promise<void> {
    this.#workletLoad ??= context.audioWorklet.addModule(workletUrl).catch((error: unknown) => {
      this.#workletLoad = null;
      throw error;
    });
    return this.#workletLoad;
  }

  #park(context: AudioContext): void {
    this.#idleContext = context;
    this.#cancelSuspend();
    this.#suspendTimer = setTimeout(() => {
      this.#suspendTimer = null;
      if (context.state === "running") void context.suspend();
    }, SUSPEND_AFTER_STOP_MS);
  }

  #cancelSuspend(): void {
    if (this.#suspendTimer !== null) clearTimeout(this.#suspendTimer);
    this.#suspendTimer = null;
  }

  #release(stream: MediaStream | null, node: AudioWorkletNode | null): void {
    node?.port.postMessage({ type: "stop" });
    node?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
  }
}

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "audioinput");
}
