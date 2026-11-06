import type { Score, ScoreEvent } from "@fretless/core";

import {
  accidentalOf,
  restShape,
  type RestKind,
  beamCount,
  beamGap,
  beamGroupOf,
  beamThickness,
  beamYAt,
  durationQuarters,
  hasStem,
  isHollowHead,
  keySignaturePositions,
  layoutBeam,
  layoutNoteMarks,
  ledgerLinePositions,
  MIDDLE_LINE_POSITION,
  noteX,
  positionY,
  slurSpans,
  STAFF_LINES,
  staffPosition,
  stemLength,
  stemUpFor,
  stemX,
  type NoteTone,
  type StaffGeometry,
} from "@/notation/staffLayout";

export interface Palette {
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
  music: string;
}

export const LINE_ALPHA = 0.6;
const PAST_ALPHA = 0.4;
const OFFSCREEN_MARGIN = 30;
const SLUR_SEGMENTS = 12;

export function readPalette(element: HTMLElement): Palette {
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
    music: token("--font-music"),
  };
}

export function toneColor(tone: NoteTone, palette: Palette): { color: string; alpha: number } {
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
    case "Unheard":
    case "unjudged":
    default:
      return { color: palette.ink, alpha: PAST_ALPHA };
  }
}

export function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

export function strokeLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, color: string, alpha = 1): void {
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

export function drawStaffLines(ctx: CanvasRenderingContext2D, geometry: StaffGeometry, palette: Palette, from = 0, to = geometry.width): void {
  for (let line = 0; line < STAFF_LINES; line += 1) {
    fillRect(ctx, from, geometry.staffTop + geometry.spacing * line, to - from, 1.2, palette.inkMuted, LINE_ALPHA);
  }
}

const REST_GLYPHS: Record<Exclude<RestKind, "whole" | "half">, string> = {
  quarter: "𝄽",
  eighth: "𝄾",
  sixteenth: "𝄿",
};

function drawRest(ctx: CanvasRenderingContext2D, score: Score, index: number, x: number, geometry: StaffGeometry, palette: Palette, tone: NoteTone): void {
  const event = score.events[index];
  if (!event) return;
  const { spacing, staffTop } = geometry;
  const { color, alpha } = toneColor(tone, palette);
  const shape = restShape(durationQuarters(score, index), score.measures[event.measureIndex]?.lengthQuarters ?? 0);
  const blockWidth = spacing * 1.2;
  if (shape.kind === "whole") {
    fillRect(ctx, x - blockWidth / 2, staffTop + spacing, blockWidth, spacing * 0.5, color, alpha);
  } else if (shape.kind === "half") {
    fillRect(ctx, x - blockWidth / 2, staffTop + spacing * 1.5, blockWidth, spacing * 0.5, color, alpha);
  } else {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.font = `${Math.round(spacing * 4)}px ${palette.music}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(REST_GLYPHS[shape.kind], x, staffTop + spacing * 2);
    ctx.restore();
  }
  if (shape.dotted) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + spacing * 1.1, staffTop + spacing * 1.5, spacing * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawFlags(ctx: CanvasRenderingContext2D, sx: number, stemY: number, stemUp: boolean, flags: number, geometry: StaffGeometry, color: string, alpha: number): void {
  const length = stemLength(geometry);
  for (let flag = 0; flag < flags; flag += 1) {
    const step = flag * beamGap(geometry);
    const flagY = stemUp ? stemY + step : stemY + length - geometry.spacing * 0.9 - step;
    strokeLine(ctx, sx, flagY, sx + geometry.spacing * 0.75, flagY + (stemUp ? geometry.spacing * 0.9 : -geometry.spacing * 0.9), 1.8, color, alpha);
  }
}

type BeamGroupLayout = ReturnType<typeof layoutBeam>;
type ScoreBeamGroup = Score["beamGroups"][number];

const beamLayouts = new WeakMap<StaffGeometry, Map<ScoreBeamGroup, BeamGroupLayout>>();

function beamLayoutFor(score: Score, group: ScoreBeamGroup, geometry: StaffGeometry): BeamGroupLayout {
  const layouts = beamLayouts.get(geometry) ?? new Map<ScoreBeamGroup, BeamGroupLayout>();
  beamLayouts.set(geometry, layouts);
  const cached = layouts.get(group);
  if (cached) return cached;
  const layout = layoutBeam(score, group, geometry);
  layouts.set(group, layout);
  return layout;
}

function drawOneMark(ctx: CanvasRenderingContext2D, mark: string, x: number, y: number, geometry: StaffGeometry, palette: Palette, color: string, alpha: number): void {
  const size = geometry.spacing;
  const line = (xa: number, ya: number, xb: number, yb: number, width = 1.4) => strokeLine(ctx, x + xa * size, y + ya * size, x + xb * size, y + yb * size, width, color, alpha);
  const word = (text: string, font: string) => {
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  };
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  switch (mark) {
    case "staccato":
      ctx.beginPath();
      ctx.arc(x, y, size * 0.17, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "staccatissimo":
      line(-0.14, -0.4, 0, 0.4);
      line(0.14, -0.4, 0, 0.4);
      break;
    case "tenuto":
      line(-0.6, 0, 0.6, 0, 1.6);
      break;
    case "accent":
      line(-0.55, -0.32, 0.55, 0);
      line(0.55, 0, -0.55, 0.32);
      break;
    case "marcato":
      line(-0.4, 0.4, 0, -0.4, 1.8);
      line(0, -0.4, 0.4, 0.4);
      break;
    case "fermata":
      ctx.beginPath();
      ctx.arc(x, y + size * 0.3, size * 0.7, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y + size * 0.15, size * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "up-bow":
      line(-0.4, -0.45, 0, 0.45);
      line(0.4, -0.45, 0, 0.45);
      break;
    case "down-bow":
      line(-0.45, -0.4, -0.45, 0.4);
      line(0.45, -0.4, 0.45, 0.4);
      line(-0.45, -0.4, 0.45, -0.4, 2.4);
      break;
    case "trill":
      word("tr", `italic 700 ${Math.round(size * 1.3)}px ${palette.music}`);
      break;
    case "mordent":
      line(-0.7, 0.2, -0.35, -0.25);
      line(-0.35, -0.25, 0, 0.2);
      line(0, 0.2, 0.35, -0.25);
      line(0.35, -0.25, 0.7, 0.2);
      break;
    case "turn":
      word("~", `700 ${Math.round(size * 1.8)}px ${palette.music}`);
      break;
    case "harmonic":
      ctx.beginPath();
      ctx.arc(x, y, size * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "pizzicato":
      word("pizz.", `italic ${Math.round(size * 1.1)}px ${palette.music}`);
      break;
    default:
      break;
  }
  ctx.globalAlpha = 1;
}

function drawNoteMarks(ctx: CanvasRenderingContext2D, event: ScoreEvent, x: number, position: number, stemUp: boolean, stemTipY: number, geometry: StaffGeometry, palette: Palette, color: string, alpha: number): void {
  if (!event.marks && !event.dynamic) return;
  const layout = layoutNoteMarks(event.marks, position, stemUp, stemTipY, geometry);
  for (const { mark, y } of layout.marks) drawOneMark(ctx, mark, x, y, geometry, palette, color, alpha);
  if (!event.dynamic) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `italic 700 ${Math.round(geometry.spacing * 1.4)}px ${palette.music}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(event.dynamic, x, layout.dynamicY);
  ctx.globalAlpha = 1;
}

export function drawNote(ctx: CanvasRenderingContext2D, score: Score, index: number, geometry: StaffGeometry, palette: Palette, tone: NoteTone): void {
  const event = score.events[index];
  if (!event) return;
  const x = noteX(geometry, event.startSeconds);
  if (x < -OFFSCREEN_MARGIN || x > geometry.width + OFFSCREEN_MARGIN) return;
  if (event.isRest) {
    drawRest(ctx, score, index, x, geometry, palette, tone);
    const rest = toneColor(tone, palette);
    drawNoteMarks(ctx, event, x, MIDDLE_LINE_POSITION, true, positionY(geometry, MIDDLE_LINE_POSITION), geometry, palette, rest.color, rest.alpha);
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

  let markStemUp = stemUpFor(position);
  let stemTipY = y;
  const group = beamGroupOf(score.beamGroups, index);
  if (group) {
    const beam = beamLayoutFor(score, group, geometry);
    const sx = stemX(geometry, event.startSeconds, beam.stemUp);
    const tip = beamYAt(beam, sx);
    markStemUp = beam.stemUp;
    stemTipY = tip;
    fillRect(ctx, sx - 0.75, Math.min(tip, y), 1.5, Math.abs(y - tip), color, alpha);
  } else if (hasStem(quarters)) {
    const stemUp = stemUpFor(position);
    const length = stemLength(geometry);
    stemTipY = stemUp ? y - length : y + length;
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

  drawNoteMarks(ctx, event, x, position, markStemUp, stemTipY, geometry, palette, color, alpha);
}

export function drawBeams(ctx: CanvasRenderingContext2D, score: Score, visible: number[], geometry: StaffGeometry, palette: Palette): void {
  const firstVisible = visible[0];
  const lastVisible = visible[visible.length - 1];
  if (firstVisible === undefined || lastVisible === undefined) return;
  const startOf = (index: number) => score.events[index]?.startSeconds ?? 0;
  const thickness = beamThickness(geometry);
  const stub = geometry.headWidth * 0.9;
  for (const group of score.beamGroups) {
    if (group.last < firstVisible) continue;
    if (group.first > lastVisible) break;
    const beam = beamLayoutFor(score, group, geometry);
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

export function drawSlurs(ctx: CanvasRenderingContext2D, score: Score, visible: number[], geometry: StaffGeometry, palette: Palette): void {
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

export function drawKeyAccidentals(ctx: CanvasRenderingContext2D, fifths: number, geometry: StaffGeometry, palette: Palette, x: number, color = palette.inkMuted): void {
  ctx.font = `${Math.round(geometry.spacing * 1.3)}px ${palette.mono}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = color;
  const mark = fifths > 0 ? "#" : "b";
  keySignaturePositions(fifths).forEach((position, index) => {
    ctx.fillText(mark, x + index * geometry.spacing * 0.9, positionY(geometry, position));
  });
}
