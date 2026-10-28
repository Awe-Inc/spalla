import { describe, expect, it } from "vitest";
import type { Score } from "@fretless/core";
import { buildClickTrack, clicksBetween, leadInClicks } from "./clickTrack";

function scoreWithMeasures(beatsPerMeasure: number, measureSeconds: number, count: number): Score {
  const measures = Array.from({ length: count }, (_, index) => ({
    startQuarters: index * beatsPerMeasure,
    startSeconds: index * measureSeconds,
    endSeconds: (index + 1) * measureSeconds,
    lengthQuarters: beatsPerMeasure,
    number: index + 1,
    beats: beatsPerMeasure,
    beatUnit: 4,
    beatOffset: 0,
  }));
  return { measures } as unknown as Score;
}

describe("buildClickTrack", () => {
  it("puts a downbeat on every bar and a beat on the rest", () => {
    const track = buildClickTrack(scoreWithMeasures(4, 2, 2), 1, 0);
    expect(track).toHaveLength(8);
    expect(track.filter((click) => click.kind === "downbeat").map((click) => click.timeSec)).toEqual([0, 2]);
    expect(track[1]).toEqual({ timeSec: 0.5, kind: "beat" });
  });

  it("adds subdivisions between beats", () => {
    const track = buildClickTrack(scoreWithMeasures(2, 2, 1), 2, 0);
    expect(track.map((click) => click.timeSec)).toEqual([0, 0.5, 1, 1.5]);
    expect(track.filter((click) => click.kind === "subdivision")).toHaveLength(2);
  });

  it("counts the lead-in backwards at the tempo of the first bar", () => {
    expect(leadInClicks(scoreWithMeasures(4, 2, 1), 2).map((click) => click.timeSec)).toEqual([-2, -1.5, -1, -0.5]);
    expect(leadInClicks(scoreWithMeasures(4, 2, 1), 0)).toEqual([]);
  });

  it("selects clicks in a half-open window so none is scheduled twice", () => {
    const track = buildClickTrack(scoreWithMeasures(4, 2, 1), 1, 0);
    const first = clicksBetween(track, -1, 0.5);
    const second = clicksBetween(track, 0.5, 1.2);
    expect(first.map((click) => click.timeSec)).toEqual([0, 0.5]);
    expect(second.map((click) => click.timeSec)).toEqual([1]);
  });
});
