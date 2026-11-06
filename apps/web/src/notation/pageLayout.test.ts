import type { Measure, Score, ScoreEvent } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { buildPageLayout, measureIndexAt, pageScrollAt, readingYAt, systemIndexAt, systemsInView, xAtSystem } from "./pageLayout";

function note(measureIndex: number, startSeconds: number, durationSeconds = 1): ScoreEvent {
  return {
    startSeconds,
    durationSeconds,
    startQuarters: startSeconds,
    frequencyHz: 440,
    midi: 69,
    measure: measureIndex + 1,
    measureIndex,
    beat: 1,
    isRest: false,
    isTiedFrom: false,
    string: 2,
    bowSpan: 1,
    bowSlot: 0, marks: "", dynamic: "",
    noteName: "A4",
    latinName: "Lá4",
  };
}

function measure(index: number): Measure {
  return { number: index + 1, startQuarters: index * 4, startSeconds: index * 4, endSeconds: index * 4 + 4, lengthQuarters: 4, beats: 4, beatUnit: 4, beatOffset: 0 };
}

function quarterScore(measureCount: number, notesPerMeasure = 4): Score {
  const length = 4 / notesPerMeasure;
  const events = Array.from({ length: measureCount }, (_, m) =>
    Array.from({ length: notesPerMeasure }, (_, n) => note(m, m * 4 + n * length, length)),
  ).flat();
  return {
    title: "Teste",
    composer: "",
    partName: "",
    beatsPerMinute: 60,
    beatsPerMeasure: 4,
    beatUnit: 4,
    keyFifths: 2,
    durationSeconds: measureCount * 4,
    noteCount: events.length,
    trimmedIntroSeconds: 0,
    tempoScale: 1,
    events,
    measures: Array.from({ length: measureCount }, (_, m) => measure(m)),
    beamGroups: [],
  };
}

describe("buildPageLayout", () => {
  it("puts every measure on exactly one line, in reading order", () => {
    const layout = buildPageLayout(quarterScore(24), 800);
    expect(layout.systems.length).toBeGreaterThan(1);
    const measures = layout.systems.flatMap((system) => Array.from({ length: system.lastMeasure - system.firstMeasure + 1 }, (_, i) => system.firstMeasure + i));
    expect(measures).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it("justifies full lines to the right margin and leaves a short last line alone", () => {
    const layout = buildPageLayout(quarterScore(9), 800);
    const full = layout.systems[0]!;
    const last = layout.systems[layout.systems.length - 1]!;
    expect(full.barXs[full.barXs.length - 1]).toBeCloseTo(full.right, 5);
    expect(last.lastMeasure - last.firstMeasure).toBeLessThan(full.lastMeasure - full.firstMeasure);
    expect(last.barXs[last.barXs.length - 1]!).toBeLessThan(last.right - 50);
  });

  it("keeps notes between their barlines, left to right", () => {
    const layout = buildPageLayout(quarterScore(6), 900);
    for (const system of layout.systems) {
      const xs = system.anchors.map((anchor) => anchor.x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
      expect(xs[0]!).toBeGreaterThan(system.barXs[0]!);
    }
  });

  it("gives the clef, key and time signature room only where they are printed", () => {
    const layout = buildPageLayout(quarterScore(24), 800);
    const [first, second] = layout.systems;
    expect(first!.showsTimeSignature).toBe(true);
    expect(second!.showsTimeSignature).toBe(false);
    expect(first!.barXs[0]!).toBeGreaterThan(second!.barXs[0]!);
  });

  it("gives a long note more room than a short one", () => {
    const layout = buildPageLayout(quarterScore(1, 8), 2000);
    const sparse = buildPageLayout(quarterScore(1, 2), 2000);
    const width = (s: typeof layout) => s.systems[0]!.barXs[1]! - s.systems[0]!.barXs[0]!;
    expect(width(layout)).toBeGreaterThan(width(sparse));
    const gapShort = layout.systems[0]!.anchors[1]!.x - layout.systems[0]!.anchors[0]!.x;
    const gapLong = sparse.systems[0]!.anchors[1]!.x - sparse.systems[0]!.anchors[0]!.x;
    expect(gapLong).toBeGreaterThan(gapShort);
  });

  it("stacks the lines in one continuous column that scales with the staff size", () => {
    const layout = buildPageLayout(quarterScore(40), 800);
    const [first, second] = layout.systems;
    expect(second!.staffTop - first!.staffTop).toBe(layout.systemHeight);
    expect(layout.contentHeight).toBe(layout.systems.length * layout.systemHeight);
    expect(buildPageLayout(quarterScore(40), 800, 1.5).systemHeight).toBe(layout.systemHeight * 1.5);
  });

  it("returns an empty page for a score without measures", () => {
    const empty = { ...quarterScore(0), measures: [], events: [] };
    expect(buildPageLayout(empty, 800).systems).toEqual([]);
  });
});

describe("automatic scroll", () => {
  const VIEW = 330;

  function scoreAt(bpmFactor: number) {
    const base = quarterScore(60);
    return {
      ...base,
      durationSeconds: base.durationSeconds / bpmFactor,
      events: base.events.map((event) => ({ ...event, startSeconds: event.startSeconds / bpmFactor, durationSeconds: event.durationSeconds / bpmFactor })),
      measures: base.measures.map((measure) => ({ ...measure, startSeconds: measure.startSeconds / bpmFactor, endSeconds: measure.endSeconds / bpmFactor })),
    };
  }

  const score = scoreAt(1);
  const layout = buildPageLayout(score, 800);
  const samples = Array.from({ length: 400 }, (_, i) => (i / 399) * score.durationSeconds);
  const furthest = layout.contentHeight - VIEW;

  it("stays still at the start and begins before the reader reaches the bottom of the screen", () => {
    expect(pageScrollAt(layout, 0, VIEW)).toBe(0);
    const firstMoving = samples.find((seconds) => pageScrollAt(layout, seconds, VIEW) > 0)!;
    expect(readingYAt(layout, firstMoving)).toBeLessThan(VIEW * 0.5);
  });

  it("never goes backwards and ends exactly at the last line", () => {
    const offsets = samples.map((seconds) => pageScrollAt(layout, seconds, VIEW));
    offsets.slice(1).forEach((offset, index) => expect(offset).toBeGreaterThanOrEqual(offsets[index]!));
    expect(offsets[offsets.length - 1]).toBe(furthest);
  });

  it("moves without jumps: no frame moves more than a small part of a line", () => {
    const secondsPerLine = (layout.systems[0]!.endSeconds - layout.systems[0]!.startSeconds);
    const frame = secondsPerLine / 60;
    for (let seconds = 0; seconds < score.durationSeconds; seconds += frame) {
      const step = pageScrollAt(layout, seconds + frame, VIEW) - pageScrollAt(layout, seconds, VIEW);
      expect(step).toBeLessThan(layout.systemHeight / 20);
    }
  });

  it("keeps the staff being read on screen with the next line visible", () => {
    for (const seconds of samples) {
      const system = layout.systems[systemIndexAt(layout, seconds)]!;
      const top = system.staffTop - pageScrollAt(layout, seconds, VIEW);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top + layout.spacing * 4).toBeLessThanOrEqual(VIEW);
    }
  });

  it("keeps the staff on screen on a screen barely taller than a line", () => {
    const short = layout.systemHeight * 1.4;
    for (const seconds of samples) {
      const system = layout.systems[systemIndexAt(layout, seconds)]!;
      const top = system.staffTop - pageScrollAt(layout, seconds, short);
      expect(top).toBeGreaterThan(-layout.spacing);
      expect(top + layout.spacing * 4).toBeLessThan(short + layout.spacing);
    }
  });

  it("follows the tempo: twice as fast, the same scroll in half the time", () => {
    const fast = scoreAt(2);
    const fastLayout = buildPageLayout(fast, 800);
    for (const seconds of [10, 40, 90, 130]) {
      expect(pageScrollAt(fastLayout, seconds / 2, VIEW)).toBeCloseTo(pageScrollAt(layout, seconds, VIEW), -1);
    }
  });

  it("draws only the lines inside the window", () => {
    const visible = systemsInView(layout, layout.systemHeight * 2.5, VIEW);
    expect(visible[0]!.index).toBe(2);
    expect(visible.length).toBeLessThanOrEqual(Math.ceil(VIEW / layout.systemHeight) + 1);
  });
});

describe("reading position", () => {
  const score = quarterScore(24);
  const layout = buildPageLayout(score, 800);

  it("finds the line that holds the current time", () => {
    const second = layout.systems[1]!;
    expect(systemIndexAt(layout, -1)).toBe(0);
    expect(systemIndexAt(layout, second.startSeconds + 0.5)).toBe(1);
    const lastIndex = systemIndexAt(layout, 1000);
    expect(lastIndex).toBe(layout.systems.length - 1);
  });

  it("moves the reading x along the notes and stops at the line's ends", () => {
    const system = layout.systems[0]!;
    const [a, b] = system.anchors;
    expect(xAtSystem(system, -5)).toBe(a!.x);
    expect(xAtSystem(system, (a!.seconds + b!.seconds) / 2)).toBeCloseTo((a!.x + b!.x) / 2, 5);
    expect(xAtSystem(system, 10_000)).toBe(system.anchors[system.anchors.length - 1]!.x);
  });

  it("knows which measure is sounding", () => {
    expect(measureIndexAt(score, 5)).toBe(1);
    expect(measureIndexAt(score, -1)).toBe(-1);
  });
});
