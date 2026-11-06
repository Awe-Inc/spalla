import type { GameStats, NoteJudgement, PracticeSession } from "@fretless/core";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { externalValue } from "@/app/externalValue";

import { canvasPixelRatio, fitCanvas } from "./canvas";
import { LiveClock } from "./LiveRunPanel";
import { readLiveRun, useLiveValue, type LiveRun } from "./liveRun";

const STATS = { judgedNotes: 1 } as GameStats;

function sessionWith(judgedNotes: number, judgements: NoteJudgement[]): PracticeSession {
  return { state: "playing", songTime: 1, currentNoteIndex: 1, liveCents: null, stats: { ...STATS, judgedNotes }, judgements } as unknown as PracticeSession;
}

function run(songTime: number, combo = 0): LiveRun {
  return { state: "playing", songTime, currentNoteIndex: 0, liveCents: null, stats: { ...STATS, combo }, judgements: [] };
}

describe("readLiveRun", () => {
  it("does not cross embind for the judgements while no new note was judged", () => {
    const first = readLiveRun(sessionWith(1, []), null);
    const crossing = vi.fn(() => []);
    const session = Object.defineProperty(sessionWith(1, []), "judgements", { get: crossing });

    const next = readLiveRun(session, first);

    expect(crossing).not.toHaveBeenCalled();
    expect(next.judgements).toBe(first.judgements);
  });

  it("reads the judgements again once a note is judged", () => {
    const first = readLiveRun(sessionWith(1, []), null);
    const judged = [{}] as NoteJudgement[];

    expect(readLiveRun(sessionWith(2, judged), first).judgements).toBe(judged);
  });
});

describe("useLiveValue", () => {
  it("re-renders a readout only when the selected value changes", () => {
    const live = externalValue<LiveRun | null>(run(1));
    const onRender = vi.fn();
    function Combo() {
      onRender();
      return <p>{useLiveValue(live, (value) => value?.stats.combo ?? 0)}</p>;
    }
    render(<Combo />);
    const rendersAtStart = onRender.mock.calls.length;

    act(() => live.set(run(1.5)));
    expect(onRender).toHaveBeenCalledTimes(rendersAtStart);

    act(() => live.set(run(2, 3)));
    expect(onRender).toHaveBeenCalledTimes(rendersAtStart + 1);
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows the clock from the live source", () => {
    const live = externalValue<LiveRun | null>(null);
    const { container } = render(<LiveClock live={live} />);
    expect(container.textContent).toBe("");

    act(() => live.set(run(2.34)));
    expect(container.textContent).toBe("2.3 s");
  });
});

describe("canvas", () => {
  it("caps the pixel ratio at 2", () => {
    expect(canvasPixelRatio(3)).toBe(2);
    expect(canvasPixelRatio(1.5)).toBe(1.5);
    expect(canvasPixelRatio(0)).toBe(1);
  });

  it("does not reset the canvas buffer when the size did not change", () => {
    const canvas = document.createElement("canvas");
    const setTransform = vi.fn();
    canvas.getContext = vi.fn(() => ({ setTransform })) as unknown as HTMLCanvasElement["getContext"];
    fitCanvas(canvas, { width: 100, height: 50 });
    const widthSetter = vi.spyOn(canvas, "width", "set");

    fitCanvas(canvas, { width: 100, height: 50 });

    expect(widthSetter).not.toHaveBeenCalled();
    expect(canvas.getContext).toHaveBeenCalledWith("2d", { alpha: false });
  });
});
