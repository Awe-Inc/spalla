import { clampBpm } from "./tempoClock";

const TAP_RESET_MS = 2000;
const MAX_TAPS = 6;

export function addTap(taps: readonly number[], nowMs: number): number[] {
  const last = taps.at(-1);
  const kept = last !== undefined && nowMs - last <= TAP_RESET_MS ? taps : [];
  return [...kept, nowMs].slice(-MAX_TAPS);
}

export function bpmFromTaps(taps: readonly number[]): number | null {
  const first = taps[0];
  const last = taps.at(-1);
  if (first === undefined || last === undefined || taps.length < 2 || last === first) return null;
  return clampBpm(60000 / ((last - first) / (taps.length - 1)));
}
