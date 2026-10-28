import { loadCore, type PitchTracker } from "@fretless/core";

import type { WorkletInbound, WorkletOutbound, WorkletOptions } from "./messages";

const DEFAULT_HOP_FRAMES = 512;

class PitchProcessor extends AudioWorkletProcessor {
  #tracker: PitchTracker | null = null;
  #hop: Float32Array;
  #filled = 0;
  #running = true;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const processorOptions = options.processorOptions as WorkletOptions;
    this.#hop = new Float32Array(processorOptions.hopFrames ?? DEFAULT_HOP_FRAMES);
    this.port.onmessage = (event: MessageEvent<WorkletInbound>) => {
      if (event.data.type === "stop") this.#running = false;
      if (event.data.type === "gain" && this.#tracker) this.#tracker.setInputGain(event.data.value);
    };
    loadCore({ wasmBinary: processorOptions.wasmBinary })
      .then((core) => {
        this.#tracker = core.createPitchTracker(sampleRate, processorOptions.windowSize);
        this.#post({ type: "ready", requiredSamples: this.#tracker.requiredSamples, sampleRate });
      })
      .catch((error: unknown) => {
        this.#post({ type: "error", message: error instanceof Error ? error.message : String(error) });
      });
  }

  #post(message: WorkletOutbound): void {
    this.port.postMessage(message);
  }

  override process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!this.#tracker || !channel) return this.#running;
    let offset = 0;
    while (offset < channel.length) {
      const take = Math.min(channel.length - offset, this.#hop.length - this.#filled);
      this.#hop.set(channel.subarray(offset, offset + take), this.#filled);
      this.#filled += take;
      offset += take;
      if (this.#filled === this.#hop.length) {
        const blockEndTime = currentTime + (offset - channel.length) / sampleRate;
        const frame = this.#tracker.process(this.#hop, blockEndTime);
        this.#post({ type: "frame", frame });
        this.#filled = 0;
      }
    }
    return this.#running;
  }
}

registerProcessor("fretless-pitch", PitchProcessor);
