import type { NoteJudgement, Score } from "@fretless/core";
import { type CSSProperties, useEffect, useRef } from "react";

import { STRING_NAMES } from "@/design/components";
import { buildHighwayGeometry, HIGHWAY_LANES, laneTop, noteBar, type HighwayGeometry, type NoteBar } from "@/notation/highwayLayout";
import { barlineTimes, noteX, toneFor, visibleEventIndices, type NoteTone } from "@/notation/staffLayout";

import { fitCanvas, useCanvasSize, type CanvasSize } from "./canvas";

interface HighwayProps {
  score: Score;
  songTime: number;
  currentNoteIndex: number;
  judgements: NoteJudgement[];
  className?: string;
  style?: CSSProperties;
}

interface Palette {
  paper: string;
  ink: string;
  barline: string;
  strings: readonly string[];
  inTune: string;
  close: string;
  off: string;
  sans: string;
}

const LANE_TINT_ALPHA = 0.12;
const LABEL_ALPHA = 0.7;
const UPCOMING_ALPHA = 0.85;
const PAST_ALPHA = 0.35;
const JUDGED_ALPHA = 0.9;
const CURRENT_OUTLINE_PX = 2;

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    paper: token("--surface-sunken"),
    ink: token("--ink"),
    barline: token("--hairline-strong"),
    strings: [token("--string-g"), token("--string-d"), token("--string-a"), token("--string-e")],
    inTune: token("--in-tune"),
    close: token("--close"),
    off: token("--off"),
    sans: token("--font-sans"),
  };
}

function barFill(tone: NoteTone, stringColor: string, palette: Palette): { color: string; alpha: number } {
  switch (tone) {
    case "current":
      return { color: stringColor, alpha: 1 };
    case "upcoming":
      return { color: stringColor, alpha: UPCOMING_ALPHA };
    case "Perfect":
    case "Great":
      return { color: palette.inTune, alpha: JUDGED_ALPHA };
    case "Good":
      return { color: palette.close, alpha: JUDGED_ALPHA };
    case "Miss":
      return { color: palette.off, alpha: JUDGED_ALPHA };
    case "Unheard":
    case "unjudged":
    default:
      return { color: stringColor, alpha: PAST_ALPHA };
  }
}

function drawLanes(ctx: CanvasRenderingContext2D, geometry: HighwayGeometry, palette: Palette): void {
  ctx.font = `600 ${Math.round(Math.max(11, Math.min(16, geometry.laneHeight * 0.3)))}px ${palette.sans}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (let row = 0; row < HIGHWAY_LANES; row += 1) {
    const stringIndex = HIGHWAY_LANES - 1 - row;
    const color = palette.strings[stringIndex] ?? palette.ink;
    const top = laneTop(geometry, row);
    ctx.globalAlpha = LANE_TINT_ALPHA;
    ctx.fillStyle = color;
    ctx.fillRect(0, top + 1, geometry.width, geometry.laneHeight - 2);
    ctx.globalAlpha = LABEL_ALPHA;
    ctx.fillText(STRING_NAMES[stringIndex] ?? "", 10, top + geometry.laneHeight / 2);
  }
  ctx.globalAlpha = 1;
}

function drawBarlines(ctx: CanvasRenderingContext2D, score: Score, geometry: HighwayGeometry, palette: Palette): void {
  ctx.fillStyle = palette.barline;
  for (const time of barlineTimes(score, geometry)) {
    const x = noteX(geometry, time);
    if (x >= 0 && x <= geometry.width) ctx.fillRect(x - 0.6, 0, 1.2, geometry.height);
  }
}

function drawBar(ctx: CanvasRenderingContext2D, bar: NoteBar, tone: NoteTone, palette: Palette): void {
  const { color, alpha } = barFill(tone, palette.strings[bar.stringIndex] ?? palette.ink, palette);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(bar.x, bar.y, bar.width, bar.height, bar.height / 2);
  ctx.fill();
  if (tone === "current") {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = CURRENT_OUTLINE_PX;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawHighway(ctx: CanvasRenderingContext2D, size: CanvasSize, palette: Palette, props: HighwayProps): void {
  const geometry = buildHighwayGeometry(size.width, size.height, props.songTime);
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, size.width, size.height);
  drawLanes(ctx, geometry, palette);
  drawBarlines(ctx, props.score, geometry, palette);
  for (const index of visibleEventIndices(props.score, geometry)) {
    const event = props.score.events[index];
    const bar = event ? noteBar(geometry, event) : null;
    if (bar && bar.x + bar.width >= 0 && bar.x <= geometry.width) {
      drawBar(ctx, bar, toneFor(index, props.currentNoteIndex, props.judgements), palette);
    }
  }
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = palette.ink;
  ctx.fillRect(geometry.cursorX - 1, 0, 2, geometry.height);
  ctx.globalAlpha = 1;
}

export function Highway({ className = "", style, ...props }: HighwayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const size = useCanvasSize(canvasRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas ? fitCanvas(canvas, size) : null;
    if (!canvas || !ctx) return;
    drawHighway(ctx, size, readPalette(canvas), props);
  }, [size, props]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Pistas das cordas: cada nota vem da direita até a linha de agora, na pista da corda em que se toca"
      className={`block w-full rounded-lg ${className}`}
      style={style}
    />
  );
}
