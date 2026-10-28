import { coreWasmUrl, DEFAULT_WINDOW_SIZE, type PitchFrame } from "@fretless/core";

import type { WorkletOptions, WorkletOutbound } from "./messages";
import workletUrl from "./pitch-worklet.ts?worker&url";

export type FrameListener = (frame: PitchFrame) => void;

const READY_TIMEOUT_MS = 10_000;

export interface PitchInputInfo {
  sampleRate: number;
  baseLatencySec: number;
  outputLatencySec: number;
  requiredSamples: number;
}

export class PitchInputCancelled extends Error {
  constructor() {
    super("A captura foi encerrada antes de ficar pronta.");
    this.name = "PitchInputCancelled";
  }
}

async function fetchWasmBinary(): Promise<ArrayBuffer> {
  const response = await fetch(coreWasmUrl);
  if (!response.ok) throw new Error(`O núcleo não carregou (HTTP ${response.status}).`);
  return response.arrayBuffer();
}

export class PitchInput {
  #context: AudioContext | null = null;
  #stream: MediaStream | null = null;
  #node: AudioWorkletNode | null = null;
  #listeners = new Set<FrameListener>();
  #generation = 0;

  get context(): AudioContext | null {
    return this.#context;
  }

  get isOpen(): boolean {
    return this.#context !== null;
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
    const context = new AudioContext({ latencyHint: "interactive" });
    this.#context = context;
    this.#stream = stream;
    try {
      const [wasmBinary] = await Promise.all([fetchWasmBinary(), context.audioWorklet.addModule(workletUrl)]);
      if (generation !== this.#generation) throw new PitchInputCancelled();
      const processorOptions: WorkletOptions = { wasmBinary, windowSize };
      const node = new AudioWorkletNode(context, "fretless-pitch", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        processorOptions,
      });
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
          if (message.type === "frame") {
            for (const listener of this.#listeners) listener(message.frame);
          }
        };
      });

      await context.resume();
      const requiredSamples = await ready;
      if (generation !== this.#generation) throw new PitchInputCancelled();
      return {
        sampleRate: context.sampleRate,
        baseLatencySec: context.baseLatency,
        outputLatencySec: context.outputLatency ?? 0,
        requiredSamples,
      };
    } catch (error: unknown) {
      await this.#release(context, stream, this.#node);
      if (this.#context === context) {
        this.#context = null;
        this.#stream = null;
        this.#node = null;
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
    await this.#release(context, stream, node);
  }

  async #release(context: AudioContext | null, stream: MediaStream | null, node: AudioWorkletNode | null): Promise<void> {
    node?.port.postMessage({ type: "stop" });
    node?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    if (context && context.state !== "closed") await context.close();
  }
}

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "audioinput");
}
