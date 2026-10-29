import type { ScoreEvent } from "@fretless/core";

import { CURSOR_FRACTION, noteX, SECONDS_VISIBLE, type TimeAxis } from "./staffLayout";

export const HIGHWAY_LANES = 4;
export const MIN_BAR_PX = 14;

const BAR_GAP_PX = 3;
const BAR_HEIGHT_FRACTION = 0.52;

export interface HighwayGeometry extends TimeAxis {
  width: number;
  height: number;
  laneHeight: number;
}

export interface NoteBar {
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
  stringIndex: number;
}

export function buildHighwayGeometry(width: number, height: number, songTime: number): HighwayGeometry {
  const cursorX = width * CURSOR_FRACTION;
  return {
    width,
    height,
    laneHeight: height / HIGHWAY_LANES,
    cursorX,
    pixelsPerSecond: (width - cursorX) / SECONDS_VISIBLE,
    songTime,
  };
}

export function laneRow(stringIndex: number): number | null {
  if (!Number.isInteger(stringIndex) || stringIndex < 0 || stringIndex >= HIGHWAY_LANES) return null;
  return HIGHWAY_LANES - 1 - stringIndex;
}

export function laneTop(geometry: HighwayGeometry, row: number): number {
  return geometry.laneHeight * row;
}

export function noteBar(geometry: HighwayGeometry, event: ScoreEvent): NoteBar | null {
  if (event.isRest) return null;
  const row = laneRow(event.string);
  if (row === null) return null;
  const height = geometry.laneHeight * BAR_HEIGHT_FRACTION;
  return {
    x: noteX(geometry, event.startSeconds),
    y: laneTop(geometry, row) + (geometry.laneHeight - height) / 2,
    width: Math.max(MIN_BAR_PX, event.durationSeconds * geometry.pixelsPerSecond - BAR_GAP_PX),
    height,
    row,
    stringIndex: event.string,
  };
}
