import type { Score, ScoreEvent } from "@fretless/core";
import { describe, expect, it, vi } from "vitest";

import { buildGeometry } from "@/notation/staffLayout";

import { drawNote, type Palette } from "./staffPaint";

const PALETTE: Palette = { paper: "#fff", ink: "#000", inkMuted: "#333", inkSubtle: "#666", barline: "#999", current: "#00f", inTune: "#0f0", close: "#ff0", off: "#f00", mono: "monospace", sans: "sans-serif", music: "serif" };

function canvasSpy() {
  const fillText = vi.fn();
  const arc = vi.fn();
  const stub = { fillText, arc, beginPath: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), ellipse: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), closePath: vi.fn() };
  return { ctx: stub as unknown as CanvasRenderingContext2D, fillText, arc };
}

function scoreWith(overrides: Partial<ScoreEvent>): Score {
  const event = { startSeconds: 0, durationSeconds: 1, startQuarters: 0, frequencyHz: 440, midi: 69, measure: 1, measureIndex: 0, beat: 1, isRest: false, isTiedFrom: false, string: 2, bowSpan: 1, bowSlot: 0, marks: "", dynamic: "", noteName: "A4", latinName: "Lá4", ...overrides } as ScoreEvent;
  return { events: [event], beamGroups: [], measures: [], tempoMap: [], beatsPerMeasure: 4, beatUnit: 4, keyFifths: 0 } as unknown as Score;
}

const geometry = buildGeometry(800, 200, 0);

describe("marcas desenhadas na nota", () => {
  it("escreve a dinâmica e o pizz. da nota", () => {
    const { ctx, fillText } = canvasSpy();
    drawNote(ctx, scoreWith({ dynamic: "mf", marks: "pizzicato" }), 0, geometry, PALETTE, "upcoming");
    const texts = fillText.mock.calls.map(([text]) => text);
    expect(texts).toContain("mf");
    expect(texts).toContain("pizz.");
  });

  it("nota sem marca não desenha texto nenhum", () => {
    const { ctx, fillText } = canvasSpy();
    drawNote(ctx, scoreWith({}), 0, geometry, PALETTE, "upcoming");
    expect(fillText).not.toHaveBeenCalled();
  });

  it("a fermata também aparece numa pausa", () => {
    const withMark = canvasSpy();
    const without = canvasSpy();
    const rest = { isRest: true, midi: -1, noteName: "" };
    drawNote(withMark.ctx, scoreWith({ ...rest, marks: "fermata" }), 0, geometry, PALETTE, "upcoming");
    drawNote(without.ctx, scoreWith(rest), 0, geometry, PALETTE, "upcoming");
    expect(withMark.arc.mock.calls.length).toBeGreaterThan(without.arc.mock.calls.length);
  });
});
