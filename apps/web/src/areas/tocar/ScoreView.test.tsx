import type { Score } from "@fretless/core";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useSettings, type PlayView } from "@/app/settings";

import { ScoreView } from "./ScoreView";

const emptyScore: Score = {
  title: "Vazia",
  composer: "",
  partName: "",
  beatsPerMinute: 60,
  beatsPerMeasure: 4,
  beatUnit: 4,
  keyFifths: 0,
  durationSeconds: 0,
  noteCount: 0,
  trimmedIntroSeconds: 0,
  tempoScale: 1,
  events: [],
  measures: [],
  beamGroups: [],
};

function renderWith(view: PlayView) {
  act(() => useSettings.getState().setPlayView(view));
  render(<ScoreView score={emptyScore} songTime={-2} currentNoteIndex={0} judgements={[]} />);
}

describe("ScoreView", () => {
  afterEach(() => act(() => useSettings.getState().setPlayView("pauta")));

  it("shows only the staff by default", () => {
    renderWith("pauta");
    expect(screen.getByRole("img", { name: /partitura rolando/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /pistas das cordas/i })).toBeNull();
  });

  it("shows only the string lanes in the lanes view", () => {
    renderWith("pistas");
    expect(screen.getByRole("img", { name: /pistas das cordas/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /partitura rolando/i })).toBeNull();
  });

  it("stacks the lanes above the staff when both are chosen", () => {
    renderWith("ambos");
    const [first, second] = screen.getAllByRole("img");
    expect(first).toHaveAccessibleName(/pistas das cordas/i);
    expect(second).toHaveAccessibleName(/partitura rolando/i);
  });
});
