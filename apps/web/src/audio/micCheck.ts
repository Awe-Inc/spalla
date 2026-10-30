import type { PitchFrame } from "@fretless/core";

export interface MicCheck {
  soundFrames: number;
  readFrames: number;
  peakRms: number;
  noiseFloor: number;
  highestHz: number;
}

export const EMPTY_MIC_CHECK: MicCheck = { soundFrames: 0, readFrames: 0, peakRms: 0, noiseFloor: 0, highestHz: 0 };

const MIN_SOUND_FRAMES = 40;
const POOR_READ_RATIO = 0.6;
const NOISY_ROOM_RMS = 0.01;
const HIGH_NOTE_HZ = 1300;
const SILENCE_DB = -90;

export function addFrame(check: MicCheck, frame: PitchFrame): MicCheck {
  const isRead = !frame.silent && !frame.lowConfidence && frame.frequencyHz > 0;
  return {
    soundFrames: check.soundFrames + (frame.silent ? 0 : 1),
    readFrames: check.readFrames + (isRead ? 1 : 0),
    peakRms: Math.max(check.peakRms, frame.rmsLinear),
    noiseFloor: frame.noiseFloor ?? check.noiseFloor,
    highestHz: isRead ? Math.max(check.highestHz, frame.frequencyHz) : check.highestHz,
  };
}

export function toDecibels(rms: number): number {
  return rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB;
}

export function readRatio(check: MicCheck): number | null {
  return check.soundFrames >= MIN_SOUND_FRAMES ? check.readFrames / check.soundFrames : null;
}

export function micAdvice(check: MicCheck): string[] {
  const advice: string[] = [];
  const ratio = readRatio(check);
  if (check.noiseFloor >= NOISY_ROOM_RMS) {
    advice.push("O ambiente está barulhento. O Spalla ignora esse ruído, mas uma nota fraca pode ficar abaixo dele.");
  }
  if (ratio === null) {
    advice.push("Toque algumas notas para o teste medir.");
    return advice;
  }
  if (ratio < POOR_READ_RATIO) {
    advice.push("O som chega, mas poucas notas são lidas. Aproxime o violino ou aumente a sensibilidade.");
  } else if (check.highestHz < HIGH_NOTE_HZ) {
    advice.push("Toque uma nota aguda, do Mi6 para cima, para ver se o microfone pega a região alta.");
  } else {
    advice.push("O microfone lê bem, inclusive as notas agudas.");
  }
  return advice;
}
