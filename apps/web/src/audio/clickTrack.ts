import type { Score } from "@fretless/core";

export type Subdivision = 1 | 2 | 3 | 4;
export type ClickKind = "downbeat" | "beat" | "subdivision";

export interface Click {
  timeSec: number;
  kind: ClickKind;
}

const CLICK_EPSILON = 1e-6;

function beatsOf(score: Score, measureIndex: number): { startSec: number; beatSec: number; beats: number } | null {
  const measure = score.measures[measureIndex];
  if (!measure || measure.beats <= 0) return null;
  const lengthSec = measure.endSeconds - measure.startSeconds;
  if (lengthSec <= 0) return null;
  return { startSec: measure.startSeconds, beatSec: lengthSec / measure.beats, beats: measure.beats };
}

export function leadInClicks(score: Score, leadInSeconds: number): Click[] {
  const first = beatsOf(score, 0);
  if (!first || leadInSeconds <= 0) return [];
  const clicks: Click[] = [];
  for (let time = -first.beatSec; time > -leadInSeconds - CLICK_EPSILON; time -= first.beatSec) {
    clicks.unshift({ timeSec: time, kind: "beat" });
  }
  return clicks;
}

export function buildClickTrack(score: Score, subdivision: Subdivision, leadInSeconds: number): Click[] {
  const clicks = leadInClicks(score, leadInSeconds);
  score.measures.forEach((_, measureIndex) => {
    const measure = beatsOf(score, measureIndex);
    if (!measure) return;
    for (let beat = 0; beat < measure.beats; beat += 1) {
      const beatStart = measure.startSec + beat * measure.beatSec;
      clicks.push({ timeSec: beatStart, kind: beat === 0 ? "downbeat" : "beat" });
      for (let part = 1; part < subdivision; part += 1) {
        clicks.push({ timeSec: beatStart + (part * measure.beatSec) / subdivision, kind: "subdivision" });
      }
    }
  });
  return clicks;
}

export function clicksBetween(track: readonly Click[], fromSec: number, toSec: number): Click[] {
  return track.filter((click) => click.timeSec > fromSec + CLICK_EPSILON && click.timeSec <= toSec + CLICK_EPSILON);
}
