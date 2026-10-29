import type { MeasureRange, Score, ScoreEvent } from "@fretless/core";

export interface PlayableNote {
  midi: number;
  startSec: number;
  durationSec: number;
}

export interface PlaybackWindow {
  startSec: number;
  endSec: number;
}

export function playbackWindow(score: Score, range: MeasureRange | null = null): PlaybackWindow {
  if (!range) return { startSec: 0, endSec: score.durationSeconds };
  const first = score.measures[range.firstIndex];
  const last = score.measures[range.lastIndex];
  return { startSec: first?.startSeconds ?? 0, endSec: last?.endSeconds ?? score.durationSeconds };
}

function isInRange(event: ScoreEvent, range: MeasureRange | null): boolean {
  return !range || (event.measureIndex >= range.firstIndex && event.measureIndex <= range.lastIndex);
}

export function playableNotes(score: Score, range: MeasureRange | null = null): PlayableNote[] {
  const notes: PlayableNote[] = [];
  for (const event of score.events) {
    if (event.isRest || !isInRange(event, range)) continue;
    const previous = notes[notes.length - 1];
    if (event.isTiedFrom && previous && previous.midi === event.midi) {
      notes[notes.length - 1] = { ...previous, durationSec: event.startSeconds + event.durationSeconds - previous.startSec };
      continue;
    }
    notes.push({ midi: event.midi, startSec: event.startSeconds, durationSec: event.durationSeconds });
  }
  return notes;
}

export function notesBetween(notes: readonly PlayableNote[], fromSec: number, toSec: number): PlayableNote[] {
  return notes.filter((note) => note.startSec >= fromSec && note.startSec < toSec);
}

export function eventIndexAt(events: readonly ScoreEvent[], songTimeSec: number): number {
  let index = 0;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (!event || event.startSeconds > songTimeSec) break;
    index = i;
  }
  return index;
}
