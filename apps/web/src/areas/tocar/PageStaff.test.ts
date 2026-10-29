import type { Measure, Score, ScoreEvent } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { drawPage } from "./PageStaff";

function note(measureIndex: number, startSeconds: number): ScoreEvent {
  return {
    startSeconds,
    durationSeconds: 1,
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

function score(measureCount: number): Score {
  const events = Array.from({ length: measureCount * 4 }, (_, i) => note(Math.floor(i / 4), i));
  return {
    title: "Teste",
    composer: "",
    partName: "",
    beatsPerMinute: 60,
    beatsPerMeasure: 4,
    beatUnit: 4,
    keyFifths: 0,
    durationSeconds: measureCount * 4,
    noteCount: events.length,
    trimmedIntroSeconds: 0,
    tempoScale: 1,
    events,
    measures: Array.from({ length: measureCount }, (_, m) => measure(m)),
    beamGroups: [],
  };
}

function recordingContext() {
  const texts: string[] = [];
  const fills: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key) {
      if (key === "fillText") return (text: string) => texts.push(text);
      if (key === "fillRect") return () => fills.push(String(target.fillStyle));
      if (key in target) return target[key as string];
      return () => undefined;
    },
    set(target, key, value) {
      target[key as string] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, fills };
}

const palette: Parameters<typeof drawPage>[2] = {
  paper: "paper",
  ink: "ink",
  inkMuted: "muted",
  inkSubtle: "subtle",
  barline: "barline",
  current: "current",
  inTune: "in-tune",
  close: "close",
  off: "off",
  sans: "sans",
  mono: "mono",
  music: "music",
};

const size = { width: 800, height: 330 };

function draw(songTime: number, readingGuide: "nota" | "compasso" | "nenhum" = "nota") {
  const recorder = recordingContext();
  drawPage(recorder.ctx, size, palette, { score: score(40), songTime, currentNoteIndex: 0, judgements: [], staffScale: 1, readingGuide });
  return recorder;
}

describe("drawPage", () => {
  it("prints the clef and turns to the page that holds the current time", () => {
    const first = draw(0);
    expect(first.texts).toContain("𝄞");
    const firstLabel = first.texts.find((text) => text.startsWith("Página"));
    expect(firstLabel).toMatch(/^Página 1 de \d+$/);
    const last = draw(1000);
    const total = firstLabel!.split(" de ")[1];
    expect(last.texts).toContain(`Página ${total} de ${total}`);
  });

  it("marks where the reader is only when a guide is chosen", () => {
    expect(draw(5, "compasso").fills).toContain("current");
    expect(draw(5, "nota").fills).toContain("current");
    expect(draw(5, "nenhum").fills).not.toContain("current");
  });
});
