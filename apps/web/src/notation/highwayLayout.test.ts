import type { ScoreEvent } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { buildHighwayGeometry, laneRow, laneTop, MIN_BAR_PX, noteBar } from "./highwayLayout";
import { buildGeometry } from "./staffLayout";

function event(overrides: Partial<ScoreEvent>): ScoreEvent {
  return {
    startSeconds: 0,
    durationSeconds: 0.5,
    startQuarters: 0,
    frequencyHz: 440,
    midi: 69,
    measure: 1,
    measureIndex: 0,
    beat: 1,
    isRest: false,
    isTiedFrom: false,
    string: 2,
    bowSpan: 1,
    bowSlot: 0,
    noteName: "A4",
    latinName: "Lá4",
    ...overrides,
  };
}

describe("laneRow", () => {
  it("puts the E string on top and the G string at the bottom, like the instrument seen from the player", () => {
    expect(laneRow(3)).toBe(0);
    expect(laneRow(2)).toBe(1);
    expect(laneRow(1)).toBe(2);
    expect(laneRow(0)).toBe(3);
  });

  it("has no lane for a string index outside the four strings", () => {
    expect(laneRow(-1)).toBeNull();
    expect(laneRow(4)).toBeNull();
    expect(laneRow(1.5)).toBeNull();
  });
});

describe("buildHighwayGeometry", () => {
  it("shares the time axis with the staff so both views line up when shown together", () => {
    const lanes = buildHighwayGeometry(1000, 240, 3);
    const staff = buildGeometry(1000, 208, 3);
    expect(lanes.cursorX).toBe(staff.cursorX);
    expect(lanes.pixelsPerSecond).toBe(staff.pixelsPerSecond);
    expect(lanes.songTime).toBe(3);
  });

  it("splits the height into four equal lanes", () => {
    const geometry = buildHighwayGeometry(800, 240, 0);
    expect(geometry.laneHeight).toBe(60);
    expect(laneTop(geometry, 0)).toBe(0);
    expect(laneTop(geometry, 3)).toBe(180);
  });
});

describe("noteBar", () => {
  const geometry = buildHighwayGeometry(1000, 240, 2);

  it("starts the bar on the now line when the note starts now, in its string's lane", () => {
    const bar = noteBar(geometry, event({ startSeconds: 2, string: 3 }));
    expect(bar?.x).toBe(geometry.cursorX);
    expect(bar?.row).toBe(0);
    expect(bar?.stringIndex).toBe(3);
  });

  it("centres the bar vertically in its lane", () => {
    const bar = noteBar(geometry, event({ string: 0 }));
    if (!bar) throw new Error("expected a bar");
    const laneCentre = laneTop(geometry, 3) + geometry.laneHeight / 2;
    expect(bar.y + bar.height / 2).toBeCloseTo(laneCentre);
    expect(bar.height).toBeLessThan(geometry.laneHeight);
  });

  it("makes the bar as long as the note lasts, with a gap before the next one", () => {
    const short = noteBar(geometry, event({ durationSeconds: 0.5 }));
    const long = noteBar(geometry, event({ durationSeconds: 1 }));
    if (!short || !long) throw new Error("expected bars");
    expect(long.width).toBeGreaterThan(short.width);
    expect(long.width).toBeLessThan(geometry.pixelsPerSecond);
  });

  it("keeps a very short note wide enough to see", () => {
    expect(noteBar(geometry, event({ durationSeconds: 0.01 }))?.width).toBe(MIN_BAR_PX);
  });

  it("draws nothing for a rest or a note with no string", () => {
    expect(noteBar(geometry, event({ isRest: true }))).toBeNull();
    expect(noteBar(geometry, event({ string: -1 }))).toBeNull();
  });
});
