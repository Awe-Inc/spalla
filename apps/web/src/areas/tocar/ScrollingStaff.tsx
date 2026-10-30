import type { NoteJudgement, Score } from "@fretless/core";
import { type CSSProperties, useEffect, useRef } from "react";

import { headerOffsets } from "@/notation/pageLayout";
import { barlineTimes, buildGeometry, noteX, toneFor, visibleEventIndices, type StaffGeometry } from "@/notation/staffLayout";

import { fitCanvas, useCanvasSize, type CanvasSize } from "./canvas";
import { drawBeams, drawKeyAccidentals, drawNote, drawSlurs, drawStaffLines, fillRect, readPalette, type Palette } from "./staffPaint";

const STAFF_LEFT = 8;

interface ScrollingStaffProps {
  score: Score;
  songTime: number;
  currentNoteIndex: number;
  judgements: NoteJudgement[];
  className?: string;
  style?: CSSProperties;
}

function drawKeySignature(ctx: CanvasRenderingContext2D, score: Score, geometry: StaffGeometry, palette: Palette): void {
  const offsets = headerOffsets(score, geometry.spacing);
  ctx.fillStyle = palette.inkMuted;
  ctx.font = `${Math.round(geometry.spacing * 4.4)}px ${palette.music}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("𝄞", STAFF_LEFT + offsets.clef, geometry.staffTop + geometry.spacing * 2.3);
  drawKeyAccidentals(ctx, score.keyFifths, geometry, palette, STAFF_LEFT + offsets.key);
}

function drawBarlines(ctx: CanvasRenderingContext2D, score: Score, geometry: StaffGeometry, palette: Palette): void {
  for (const time of barlineTimes(score, geometry)) {
    const x = noteX(geometry, time);
    if (x < 0 || x > geometry.width) continue;
    fillRect(ctx, x, geometry.staffTop, 1.2, geometry.spacing * 4, palette.barline);
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
