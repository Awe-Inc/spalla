import type { Score } from "@fretless/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScrollingStaff } from "./ScrollingStaff";

const emptyScore: Score = {
  title: "Vazia",
  composer: "",
  partName: "",
  beatsPerMinute: 60,
  beatsPerMeasure: 4,
  beatUnit: 4,
  keyFifths: 1,
  durationSeconds: 0,
  noteCount: 0,
  trimmedIntroSeconds: 0,
  tempoScale: 1,
  events: [],
  measures: [],
  beamGroups: [],
};

describe("ScrollingStaff", () => {
  it("renders an accessible canvas and survives a scope without 2D context", () => {
    render(<ScrollingStaff score={emptyScore} songTime={-2} currentNoteIndex={0} judgements={[]} />);
    expect(screen.getByRole("img", { name: /partitura rolando/i })).toBeInstanceOf(HTMLCanvasElement);
  });
});
