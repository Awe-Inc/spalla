import type { NoteJudgement, Score } from "@fretless/core";
import { type CSSProperties, useEffect, useRef } from "react";

import type { PageStyle, ReadingGuide } from "@/app/settings";
import {
  buildPageLayout,
  headerOffsets,
  PAGE_SPACING_PX,
  measureIndexAt,
  pageOfSystem,
  systemIndexAt,
  systemsOnPage,
  xAtSystem,
  type PageLayout,
  type PageSystem,
} from "@/notation/pageLayout";
import { positionY, toneFor, type NoteTone, type StaffGeometry } from "@/notation/staffLayout";

import { fitCanvas, useCanvasSize, type CanvasSize } from "./canvas";
import { drawBeams, drawKeyAccidentals, drawNote, drawSlurs, drawStaffLines, fillRect, readPalette, type Palette } from "./staffPaint";

interface PageStaffProps {
  score: Score;
  songTime: number;
  currentNoteIndex: number;
  judgements: NoteJudgement[];
  staffScale: number;
  pageStyle: PageStyle;
  readingGuide: ReadingGuide;
  className?: string;
  style?: CSSProperties;
}

type PageDrawProps = Pick<PageStaffProps, "score" | "songTime" | "currentNoteIndex" | "judgements" | "staffScale" | "readingGuide">;

const PAGE_THEMES: Record<PageStyle, { theme: "light" | "dark"; accent?: "sepia" }> = {
  papel: { theme: "light" },
  sepia: { theme: "light", accent: "sepia" },
  noite: { theme: "dark" },
};

const FOOTER_SPACES = 2;
const BAND_ALPHA = 0.14;
const CURSOR_ALPHA = 0.55;

function readPagePalette(element: HTMLElement): Palette {
  return { ...readPalette(element), paper: getComputedStyle(element).getPropertyValue("--surface").trim() };
}

function guideTone(guide: ReadingGuide, index: number, currentNoteIndex: number, judgements: NoteJudgement[]): NoteTone {
  if (guide === "nenhum") return "upcoming";
  const tone = toneFor(index, currentNoteIndex, judgements);
  return guide === "compasso" && tone === "current" ? "upcoming" : tone;
}

function systemGeometry(system: PageSystem, layout: PageLayout, size: CanvasSize): StaffGeometry {
  const { spacing } = layout;
  const headHeight = spacing * 0.92;
  return {
    width: size.width,
    height: size.height,
    spacing,
    staffTop: system.staffTop,
    bottomY: system.staffTop + spacing * 4,
    cursorX: 0,
    pixelsPerSecond: 0,
    headWidth: headHeight * 1.32,
    headHeight,
    songTime: 0,
    xAt: (seconds) => xAtSystem(system, seconds),
  };
}

function drawHeader(ctx: CanvasRenderingContext2D, score: Score, system: PageSystem, geometry: StaffGeometry, palette: Palette): void {
  const { spacing, staffTop } = geometry;
  const offsets = headerOffsets(score, spacing);
  ctx.fillStyle = palette.ink;
  ctx.font = `${Math.round(spacing * 4.4)}px ${palette.music}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("𝄞", system.left + offsets.clef, staffTop + spacing * 2.3);
  drawKeyAccidentals(ctx, score.keyFifths, geometry, palette, system.left + offsets.key, palette.ink);
  if (system.showsTimeSignature) {
    ctx.fillStyle = palette.ink;
    ctx.font = `600 ${Math.round(spacing * 2)}px ${palette.sans}`;
    ctx.textAlign = "center";
    const x = system.left + offsets.time + spacing;
    ctx.fillText(String(score.beatsPerMeasure), x, staffTop + spacing);
    ctx.fillText(String(score.beatUnit), x, staffTop + spacing * 3);
  }
  const first = score.measures[system.firstMeasure];
  if (first && first.number > 0 && system.index > 0) {
    ctx.fillStyle = palette.inkSubtle;
    ctx.font = `${Math.round(spacing * 1.1)}px ${palette.sans}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(first.number), system.left, staffTop - spacing * 0.8);
  }
}

function drawSystemBarlines(ctx: CanvasRenderingContext2D, score: Score, system: PageSystem, geometry: StaffGeometry, palette: Palette): void {
  const height = geometry.spacing * 4;
  fillRect(ctx, system.left, geometry.staffTop, 1.2, height, palette.ink);
  const endsPiece = system.lastMeasure === score.measures.length - 1;
  system.barXs.slice(1).forEach((x, offset, all) => {
    const isFinal = endsPiece && offset === all.length - 1;
    if (isFinal) {
      fillRect(ctx, x - geometry.spacing * 0.9, geometry.staffTop, 1.2, height, palette.ink);
      fillRect(ctx, x - geometry.spacing * 0.5, geometry.staffTop, geometry.spacing * 0.5, height, palette.ink);
    } else {
      fillRect(ctx, x - 0.6, geometry.staffTop, 1.2, height, palette.ink);
    }
  });
}

function drawGuide(ctx: CanvasRenderingContext2D, props: PageDrawProps, system: PageSystem, geometry: StaffGeometry, palette: Palette, isCurrent: boolean): void {
  const { spacing, staffTop } = geometry;
  if (props.readingGuide === "compasso") {
    const measure = measureIndexAt(props.score, props.songTime);
    if (measure < system.firstMeasure || measure > system.lastMeasure) return;
    const x0 = system.barXs[measure - system.firstMeasure] ?? system.left;
    const x1 = system.barXs[measure - system.firstMeasure + 1] ?? x0;
    fillRect(ctx, x0, staffTop - spacing * 1.5, x1 - x0, spacing * 7, palette.current, BAND_ALPHA);
  } else if (props.readingGuide === "nota" && isCurrent) {
    const x = xAtSystem(system, props.songTime);
    fillRect(ctx, x - 1, staffTop - spacing * 1.5, 2, spacing * 7, palette.current, CURSOR_ALPHA);
  }
}

function drawSystem(ctx: CanvasRenderingContext2D, props: PageDrawProps, system: PageSystem, geometry: StaffGeometry, palette: Palette, isCurrent: boolean): void {
  const { score } = props;
  drawGuide(ctx, props, system, geometry, palette, isCurrent);
  drawStaffLines(ctx, geometry, palette, system.left, system.barXs[system.barXs.length - 1] ?? system.right);
  drawSystemBarlines(ctx, score, system, geometry, palette);
  drawHeader(ctx, score, system, geometry, palette);
  if (system.firstEvent < 0) return;
  const indices = Array.from({ length: system.lastEvent - system.firstEvent + 1 }, (_, offset) => system.firstEvent + offset);
  const systemScore: Score = { ...score, beamGroups: score.beamGroups.filter((group) => group.first >= system.firstEvent && group.last <= system.lastEvent) };
  for (const index of indices) {
    drawNote(ctx, systemScore, index, geometry, palette, guideTone(props.readingGuide, index, props.currentNoteIndex, props.judgements));
  }
  drawBeams(ctx, systemScore, indices, geometry, palette);
  drawSlurs(ctx, systemScore, indices, geometry, palette);
}

export function drawPage(ctx: CanvasRenderingContext2D, size: CanvasSize, palette: Palette, props: PageDrawProps): void {
  ctx.clearRect(0, 0, size.width, size.height);
  fillRect(ctx, 0, 0, size.width, size.height, palette.paper);
  const footer = FOOTER_SPACES * PAGE_SPACING_PX * props.staffScale;
  const layout = buildPageLayout(props.score, size.width, size.height - footer, props.staffScale);
  if (layout.systems.length === 0) return;
  const current = systemIndexAt(layout, props.songTime);
  const page = pageOfSystem(layout, current);
  for (const system of systemsOnPage(layout, page)) {
    drawSystem(ctx, props, system, systemGeometry(system, layout, size), palette, system.index === current);
  }
  ctx.fillStyle = palette.inkSubtle;
  ctx.font = `${Math.round(layout.spacing * 1.1)}px ${palette.sans}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`Página ${page + 1} de ${layout.pageCount}`, size.width - layout.spacing * 2, size.height - layout.spacing * 0.8);
}

export function PageStaff({ className = "", style, pageStyle, ...props }: PageStaffProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const size = useCanvasSize(canvasRef);
  const theme = PAGE_THEMES[pageStyle];

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas ? fitCanvas(canvas, size) : null;
    if (!canvas || !ctx) return;
    drawPage(ctx, size, readPagePalette(canvas), props);
  }, [size, props, pageStyle]);

  return (
    <div data-theme={theme.theme} data-accent={theme.accent} className={`overflow-hidden rounded-lg bg-surface shadow-card ${className}`} style={style}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Partitura em página: leia linha por linha, a página vira sozinha"
        className="block h-full w-full"
      />
    </div>
  );
}
