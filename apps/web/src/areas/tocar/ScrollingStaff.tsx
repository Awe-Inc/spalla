import type { NoteJudgement, Score } from "@fretless/core";
import { type CSSProperties, useEffect, useRef } from "react";

import {
  accidentalOf,
  barlineTimes,
  beamCount,
  beamGap,
  beamGroupOf,
  beamThickness,
  beamYAt,
  buildGeometry,
  durationQuarters,
  hasStem,
  isHollowHead,
  keySignaturePositions,
  layoutBeam,
  ledgerLinePositions,
  noteX,
  positionY,
  slurSpans,
  STAFF_LINES,
  staffPosition,
  stemLength,
  stemUpFor,
  stemX,
  toneFor,
  visibleEventIndices,
  type NoteTone,
  type StaffGeometry,
} from "@/notation/staffLayout";

import { fitCanvas, useCanvasSize, type CanvasSize } from "./canvas";

interface ScrollingStaffProps {
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
  inkMuted: string;
  inkSubtle: string;
  barline: string;
  current: string;
  inTune: string;
  close: string;
  off: string;
  mono: string;
  sans: string;
}

const LINE_ALPHA = 0.6;
const PAST_ALPHA = 0.4;
const OFFSCREEN_MARGIN = 30;
const SLUR_SEGMENTS = 12;

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    paper: token("--surface-sunken"),
    ink: token("--ink"),
    inkMuted: token("--ink-muted"),
    inkSubtle: token("--ink-subtle"),
    barline: token("--hairline-strong"),
    current: token("--primary"),
    inTune: token("--in-tune"),
    close: token("--close"),
    off: token("--off"),
    mono: token("--font-mono"),
    sans: token("--font-sans"),
  };
}

function toneColor(tone: NoteTone, palette: Palette): { color: string; alpha: number } {
  switch (tone) {
    case "current":
      return { color: palette.current, alpha: 1 };
    case "upcoming":
      return { color: palette.ink, alpha: 1 };
    case "Perfect":
    case "Great":
      return { color: palette.inTune, alpha: 0.9 };
    case "Good":
      return { color: palette.close, alpha: 0.9 };
    case "Miss":
      return { color: palette.off, alpha: 0.9 };
    case "unjudged":
    default:
      return { color: palette.ink, alpha: PAST_ALPHA };
  }
}

function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

function strokeLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function fillHead(ctx: CanvasRenderingContext2D, x: number, y: number, geometry: StaffGeometry, color: string, alpha: number, hollow: boolean, paper: string): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, geometry.headWidth / 2, geometry.headHeight / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (hollow) {
    ctx.fillStyle = paper;
    ctx.beginPath();
    ctx.ellipse(x, y, geometry.headWidth / 2 - 2, geometry.headHeight / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawStaffLines(ctx: CanvasRenderingContext2D, geometry: StaffGeometry, palette: Palette): void {
  for (let line = 0; line < STAFF_LINES; line += 1) {
    fillRect(ctx, 0, geometry.staffTop + geometry.spacing * line, geometry.width, 1.2, palette.inkMuted, LINE_ALPHA);
  }
}

function drawKeySignature(ctx: CanvasRenderingContext2D, score: Score, geometry: StaffGeometry, palette: Palette): void {
  ctx.font = `${Math.round(geometry.spacing * 1.3)}px ${palette.mono}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = palette.inkMuted;
  const mark = score.keyFifths > 0 ? "#" : "b";
  keySignaturePositions(score.keyFifths).forEach((position, index) => {
    ctx.fillText(mark, 12 + index * 9, positionY(geometry, position));
  });
  ctx.font = `${Math.round(geometry.spacing * 0.9)}px ${palette.sans}`;
  ctx.fillStyle = palette.inkSubtle;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Clave de Sol", 8, geometry.spacing * 0.9 + 4);
}

function drawBarlines(ctx: CanvasRenderingContext2D, score: Score, geometry: StaffGeometry, palette: Palette): void {
  for (const time of barlineTimes(score, geometry)) {
    const x = noteX(geometry, time);
    if (x < 0 || x > geometry.width) continue;
    fillRect(ctx, x, geometry.staffTop, 1.2, geometry.spacing * 4, palette.barline);
  }
}

function drawRest(ctx: CanvasRenderingContext2D, x: number, geometry: StaffGeometry, palette: Palette): void {
  const middleY = geometry.staffTop + geometry.spacing * 2;
  fillRect(ctx, x - geometry.headWidth * 0.3, middleY - geometry.spacing * 0.5, geometry.headWidth * 0.6, geometry.spacing, palette.inkMuted, 0.7);
}

function drawFlags(ctx: CanvasRenderingContext2D, sx: number, stemY: number, stemUp: boolean, flags: number, geometry: StaffGeometry, color: string, alpha: number): void {
  const length = stemLength(geometry);
  for (let flag = 0; flag < flags; flag += 1) {
    const step = flag * beamGap(geometry);
    const flagY = stemUp ? stemY + step : stemY + length - geometry.spacing * 0.9 - step;
    strokeLine(ctx, sx, flagY, sx + geometry.spacing * 0.75, flagY + (stemUp ? geometry.spacing * 0.9 : -geometry.spacing * 0.9), 1.8, color, alpha);
  }
}

function drawNote(ctx: CanvasRenderingContext2D, score: Score, index: number, geometry: StaffGeometry, palette: Palette, tone: NoteTone): void {
  const event = score.events[index];
  if (!event) return;
  const x = noteX(geometry, event.startSeconds);
  if (x < -OFFSCREEN_MARGIN || x > geometry.width + OFFSCREEN_MARGIN) return;
  if (event.isRest) {
    drawRest(ctx, x, geometry, palette);
    return;
  }
  const position = staffPosition(event.noteName);
  const y = positionY(geometry, position);
  const { color, alpha } = toneColor(tone, palette);

  for (const ledger of ledgerLinePositions(position)) {
    fillRect(ctx, x - geometry.headWidth * 0.85, positionY(geometry, ledger), geometry.headWidth * 1.7, 1, palette.inkMuted, 0.8);
  }

  const quarters = durationQuarters(score, index);
  fillHead(ctx, x, y, geometry, color, alpha, isHollowHead(quarters), palette.paper);

  const group = beamGroupOf(score.beamGroups, index);
  if (group) {
    const beam = layoutBeam(score, group, geometry);
    const sx = stemX(geometry, event.startSeconds, beam.stemUp);
    const tip = beamYAt(beam, sx);
    fillRect(ctx, sx - 0.75, Math.min(tip, y), 1.5, Math.abs(y - tip), color, alpha);
  } else if (hasStem(quarters)) {
    const stemUp = stemUpFor(position);
    const length = stemLength(geometry);
    const sx = stemX(geometry, event.startSeconds, stemUp);
    const stemY = stemUp ? y - length : y;
    fillRect(ctx, sx - 0.75, stemY, 1.5, length, color, alpha);
    drawFlags(ctx, sx, stemY, stemUp, beamCount(quarters), geometry, color, alpha);
  }

  const accidental = accidentalOf(event.noteName);
  if (accidental) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.font = `${Math.round(geometry.spacing * 1.3)}px ${palette.mono}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText(accidental, x - geometry.headWidth * 0.8, y);
    ctx.globalAlpha = 1;
  }
}

function drawBeams(ctx: CanvasRenderingContext2D, score: Score, visible: number[], geometry: StaffGeometry, palette: Palette): void {
  const firstVisible = visible[0];
  const lastVisible = visible[visible.length - 1];
  if (firstVisible === undefined || lastVisible === undefined) return;
  const startOf = (index: number) => score.events[index]?.startSeconds ?? 0;
  const thickness = beamThickness(geometry);
  const stub = geometry.headWidth * 0.9;
  for (const group of score.beamGroups) {
    if (group.last < firstVisible) continue;
    if (group.first > lastVisible) break;
    const beam = layoutBeam(score, group, geometry);
    const inward = beam.stemUp ? 1 : -1;
    const segment = (xa: number, xb: number, level: number) => {
      const offset = inward * (thickness / 2 + level * beamGap(geometry));
      strokeLine(ctx, xa, beamYAt(beam, xa) + offset, xb, beamYAt(beam, xb) + offset, thickness, palette.ink);
    };
    const carries = (i: number, level: number) => beamCount(durationQuarters(score, i)) > level;

    segment(beam.x0, stemX(geometry, startOf(group.last), beam.stemUp), 0);
    for (let level = 1; level < beam.levels; level += 1) {
      let i = group.first;
      while (i <= group.last) {
        if (!carries(i, level)) {
          i += 1;
          continue;
        }
        let end = i;
        while (end < group.last && carries(end + 1, level)) end += 1;
        const xa = stemX(geometry, startOf(i), beam.stemUp);
        if (end > i) segment(xa, stemX(geometry, startOf(end), beam.stemUp), level);
        else if (i === group.last) segment(xa - stub, xa, level);
        else segment(xa, xa + stub, level);
        i = end + 1;
      }
    }
  }
}

function drawSlurs(ctx: CanvasRenderingContext2D, score: Score, visible: number[], geometry: StaffGeometry, palette: Palette): void {
  const slurY = geometry.bottomY - geometry.spacing * 4 - 12;
  for (const span of slurSpans(score, visible)) {
    const first = score.events[span.firstIndex];
    const last = score.events[span.lastIndex];
    if (!first || !last) continue;
    const x0 = noteX(geometry, first.startSeconds);
    const x1 = noteX(geometry, last.startSeconds);
    if (x1 < -OFFSCREEN_MARGIN || x0 > geometry.width + OFFSCREEN_MARGIN || x1 <= x0) continue;
    const cx = (x0 + x1) / 2;
    const cy = slurY - Math.min(18, (x1 - x0) * 0.18) * 2;
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, slurY);
    for (let step = 1; step <= SLUR_SEGMENTS; step += 1) {
      const t = step / SLUR_SEGMENTS;
      const u = 1 - t;
      ctx.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * slurY + 2 * u * t * cy + t * t * slurY);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPlayhead(ctx: CanvasRenderingContext2D, geometry: StaffGeometry, palette: Palette): void {
  fillRect(ctx, geometry.cursorX - 1, 0, 2, geometry.height, palette.current, 0.85);
  ctx.fillStyle = palette.current;
  ctx.beginPath();
  ctx.roundRect(geometry.cursorX - 5, 0, 10, 6, 2);
  ctx.fill();
}

export function drawStaff(ctx: CanvasRenderingContext2D, size: CanvasSize, palette: Palette, props: ScrollingStaffProps): void {
  const geometry = buildGeometry(size.width, size.height, props.songTime);
  ctx.clearRect(0, 0, size.width, size.height);
  fillRect(ctx, 0, 0, size.width, size.height, palette.paper);
  drawStaffLines(ctx, geometry, palette);
  drawKeySignature(ctx, props.score, geometry, palette);
  drawBarlines(ctx, props.score, geometry, palette);
  const visible = visibleEventIndices(props.score, geometry);
  for (const index of visible) {
    drawNote(ctx, props.score, index, geometry, palette, toneFor(index, props.currentNoteIndex, props.judgements));
  }
  drawBeams(ctx, props.score, visible, geometry, palette);
  drawSlurs(ctx, props.score, visible, geometry, palette);
  drawPlayhead(ctx, geometry, palette);
}

export function ScrollingStaff({ className = "", style, ...props }: ScrollingStaffProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const size = useCanvasSize(canvasRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas ? fitCanvas(canvas, size) : null;
    if (!canvas || !ctx) return;
    drawStaff(ctx, size, readPalette(canvas), props);
  }, [size, props]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Partitura rolando: as notas vêm da direita até a linha de agora"
      className={`block w-full rounded-lg ${className}`}
      style={style}
    />
  );
}
