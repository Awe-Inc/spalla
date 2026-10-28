import type { PitchFrame } from "@fretless/core";

export const CLICK_ONSET_RMS = 0.04;
export const QUIET_RMS = 0.01;

export interface LatencySample {
  clickAtSec: number;
  heardAtSec: number;
}

export interface LatencyReport {
  samples: number;
  meanMs: number;
  jitterMs: number;
  minMs: number;
  maxMs: number;
}

export function playClick(context: AudioContext, atSec: number, durationSec = 0.02): void {
  const oscillator = new OscillatorNode(context, { type: "square", frequency: 1000 });
  const gain = new GainNode(context, { gain: 0 });
  gain.gain.setValueAtTime(0.6, atSec);
  gain.gain.setValueAtTime(0, atSec + durationSec);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(atSec);
  oscillator.stop(atSec + durationSec + 0.01);
}

export class OnsetDetector {
  #armed = true;

  feed(frame: PitchFrame): number | null {
    if (frame.rmsLinear < QUIET_RMS) {
      this.#armed = true;
      return null;
    }
    if (this.#armed && frame.rmsLinear >= CLICK_ONSET_RMS) {
      this.#armed = false;
      return frame.streamTimeSec;
    }
    return null;
  }
}

export function summarize(samples: readonly LatencySample[]): LatencyReport | null {
  if (samples.length === 0) return null;
  const delaysMs = samples.map((sample) => (sample.heardAtSec - sample.clickAtSec) * 1000);
  const meanMs = delaysMs.reduce((sum, value) => sum + value, 0) / delaysMs.length;
  const variance = delaysMs.reduce((sum, value) => sum + (value - meanMs) ** 2, 0) / delaysMs.length;
  return {
    samples: delaysMs.length,
    meanMs,
    jitterMs: Math.sqrt(variance),
    minMs: Math.min(...delaysMs),
    maxMs: Math.max(...delaysMs),
  };
}

export function verdict(report: LatencyReport): "aprovado" | "limite" | "reprovado" {
  if (report.meanMs <= 30 && report.jitterMs < 5) return "aprovado";
  if (report.meanMs <= 45 && report.jitterMs < 10) return "limite";
  return "reprovado";
}
