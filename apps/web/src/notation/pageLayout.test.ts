import type { Measure, Score, ScoreEvent } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { buildPageLayout, measureIndexAt, pageOfSystem, systemIndexAt, systemsOnPage, xAtSystem } from "./pageLayout";

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
    bowSlot: 0,
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
    const layout = buildPageLayout(quarterScore(24), 800, 400);
    expect(layout.systems.length).toBeGreaterThan(1);
    const measures = layout.systems.flatMap((system) => Array.from({ length: system.lastMeasure - system.firstMeasure + 1 }, (_, i) => system.firstMeasure + i));
    expect(measures).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it("justifies full lines to the right margin and leaves a short last line alone", () => {
    const layout = buildPageLayout(quarterScore(9), 800, 400);
    const full = layout.systems[0]!;
    const last = layout.systems[layout.systems.length - 1]!;
    expect(full.barXs[full.barXs.length - 1]).toBeCloseTo(full.right, 5);
    expect(last.lastMeasure - last.firstMeasure).toBeLessThan(full.lastMeasure - full.firstMeasure);
    expect(last.barXs[last.barXs.length - 1]!).toBeLessThan(last.right - 50);
  });

  it("keeps notes between their barlines, left to right", () => {
    const layout = buildPageLayout(quarterScore(6), 900, 400);
    for (const system of layout.systems) {
      const xs = system.anchors.map((anchor) => anchor.x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
      expect(xs[0]!).toBeGreaterThan(system.barXs[0]!);
    }
  });

  it("gives the clef, key and time signature room only where they are printed", () => {
    const layout = buildPageLayout(quarterScore(24), 800, 400);
    const [first, second] = layout.systems;
    expect(first!.showsTimeSignature).toBe(true);
    expect(second!.showsTimeSignature).toBe(false);
    expect(first!.barXs[0]!).toBeGreaterThan(second!.barXs[0]!);
  });

  it("gives a long note more room than a short one", () => {
    const layout = buildPageLayout(quarterScore(1, 8), 2000, 400);
    const sparse = buildPageLayout(quarterScore(1, 2), 2000, 400);
    const width = (s: typeof layout) => s.systems[0]!.barXs[1]! - s.systems[0]!.barXs[0]!;
    expect(width(layout)).toBeGreaterThan(width(sparse));
    const gapShort = layout.systems[0]!.anchors[1]!.x - layout.systems[0]!.anchors[0]!.x;
    const gapLong = sparse.systems[0]!.anchors[1]!.x - sparse.systems[0]!.anchors[0]!.x;
    expect(gapLong).toBeGreaterThan(gapShort);
  });

  it("splits lines into pages by height and scales with the staff size", () => {
    const layout = buildPageLayout(quarterScore(40), 800, 350);
    expect(layout.systemsPerPage).toBe(3);
    expect(layout.pageCount).toBe(Math.ceil(layout.systems.length / 3));
    expect(systemsOnPage(layout, 1)[0]!.index).toBe(3);
    expect(systemsOnPage(layout, 1)[0]!.staffTop).toBe(layout.systems[0]!.staffTop);
    expect(buildPageLayout(quarterScore(40), 800, 350, 1.5).systemsPerPage).toBe(2);
  });

  it("returns an empty page for a score without measures", () => {
    const empty = { ...quarterScore(0), measures: [], events: [] };
    expect(buildPageLayout(empty, 800, 400).systems).toEqual([]);
  });
});

describe("reading position", () => {
  const score = quarterScore(24);
  const layout = buildPageLayout(score, 800, 250);

  it("finds the line and the page that hold the current time", () => {
    const second = layout.systems[1]!;
    expect(systemIndexAt(layout, -1)).toBe(0);
    expect(systemIndexAt(layout, second.startSeconds + 0.5)).toBe(1);
    const lastIndex = systemIndexAt(layout, 1000);
    expect(lastIndex).toBe(layout.systems.length - 1);
    expect(pageOfSystem(layout, lastIndex)).toBe(layout.pageCount - 1);
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
