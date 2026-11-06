import type { NoteJudgement, Score } from "@fretless/core";
import { type CSSProperties, useCallback, useMemo, useRef } from "react";

import type { PageStyle, ReadingGuide } from "@/app/settings";
import {
  buildPageLayout,
  headerOffsets,
  PAGE_SPACING_PX,
  measureIndexAt,
  pageScrollAt,
  systemIndexAt,
  systemsInView,
  xAtSystem,
  type PageLayout,
  type PageSystem,
} from "@/notation/pageLayout";
import { positionY, toneFor, type NoteTone, type StaffGeometry } from "@/notation/staffLayout";

import { canvasPixelRatio, useFramePainter, type CanvasSize, type FramePaint } from "./canvas";
import type { FrameSource } from "./liveRun";
import { drawBeams, drawExpressions, drawKeyAccidentals, drawNote, drawSlurs, drawStaffLines, fillRect, readPalette, type Palette } from "./staffPaint";

interface PageStaffProps {
  score: Score;
  songTime: number;
  currentNoteIndex: number;
  judgements: NoteJudgement[];
  live?: FrameSource | undefined;
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

interface CachedLayout {
  width: number;
  staffScale: number;
  layout: PageLayout;
}

const layoutByScore = new WeakMap<Score, CachedLayout>();
const scoreBySystem = new WeakMap<PageSystem, Score>();
const geometryBySystem = new WeakMap<PageSystem, StaffGeometry>();

export function cachedPageLayout(score: Score, width: number, staffScale: number): PageLayout {
  const cached = layoutByScore.get(score);
  if (cached && cached.width === width && cached.staffScale === staffScale) return cached.layout;
  const layout = buildPageLayout(score, width, staffScale);
  layoutByScore.set(score, { width, staffScale, layout });
  return layout;
}

function scoreOfSystem(score: Score, system: PageSystem): Score {
  const cached = scoreBySystem.get(system);
  if (cached) return cached;
  const systemScore: Score = { ...score, beamGroups: score.beamGroups.filter((group) => group.first >= system.firstEvent && group.last <= system.lastEvent) };
  scoreBySystem.set(system, systemScore);
  return systemScore;
}

function readPagePalette(element: HTMLElement): Palette {
  return { ...readPalette(element), paper: getComputedStyle(element).getPropertyValue("--surface").trim() };
}

function guideTone(guide: ReadingGuide, index: number, currentNoteIndex: number, judgements: NoteJudgement[]): NoteTone {
  if (guide === "nenhum") return "upcoming";
  const tone = toneFor(index, currentNoteIndex, judgements);
  return guide === "compasso" && tone === "current" ? "upcoming" : tone;
}

function systemGeometry(system: PageSystem, layout: PageLayout, size: CanvasSize): StaffGeometry {
  const cached = geometryBySystem.get(system);
  if (cached) return cached;
  const { spacing } = layout;
  const headHeight = spacing * 0.92;
  const geometry: StaffGeometry = {
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
  geometryBySystem.set(system, geometry);
  return geometry;
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
  const systemScore = scoreOfSystem(score, system);
  for (const index of indices) {
    drawNote(ctx, systemScore, index, geometry, palette, guideTone(props.readingGuide, index, props.currentNoteIndex, props.judgements));
  }
  drawBeams(ctx, systemScore, indices, geometry, palette);
  drawSlurs(ctx, systemScore, indices, geometry, palette);
  drawExpressions(ctx, score.expressions, system.startSeconds, system.endSeconds, geometry, palette);
}

export function drawPage(ctx: CanvasRenderingContext2D, size: CanvasSize, palette: Palette, props: PageDrawProps): void {
  ctx.clearRect(0, 0, size.width, size.height);
  fillRect(ctx, 0, 0, size.width, size.height, palette.paper);
  const footer = FOOTER_SPACES * PAGE_SPACING_PX * props.staffScale;
  const viewHeight = size.height - footer;
  const layout = cachedPageLayout(props.score, size.width, props.staffScale);
  if (layout.systems.length === 0) return;
  const current = systemIndexAt(layout, props.songTime);
  const pixelRatio = canvasPixelRatio(window.devicePixelRatio);
  const scrollTop = Math.round(pageScrollAt(layout, props.songTime, viewHeight) * pixelRatio) / pixelRatio;
  ctx.save();
  ctx.translate(0, -scrollTop);
  for (const system of systemsInView(layout, scrollTop, viewHeight)) {
    drawSystem(ctx, props, system, systemGeometry(system, layout, size), palette, system.index === current);
  }
  ctx.restore();
  fillRect(ctx, 0, viewHeight, size.width, footer, palette.paper);
  ctx.fillStyle = palette.inkSubtle;
  ctx.font = `${Math.round(layout.spacing * 1.1)}px ${palette.sans}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`Linha ${current + 1} de ${layout.systems.length}`, size.width - layout.spacing * 2, size.height - layout.spacing * 0.8);
}

export function PageStaff({ className = "", style, pageStyle, score, live, songTime, currentNoteIndex, judgements, staffScale, readingGuide }: PageStaffProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const theme = PAGE_THEMES[pageStyle];
  const frame = useMemo(() => ({ songTime, currentNoteIndex, judgements }), [songTime, currentNoteIndex, judgements]);
  const paint = useCallback<FramePaint<Palette>>(
    (ctx, size, palette, current) => drawPage(ctx, size, palette, { score, staffScale, readingGuide, ...current }),
    [score, staffScale, readingGuide],
  );
  useFramePainter({ canvasRef, readPalette: readPagePalette, paletteKey: pageStyle, paint, frame, live });

  return (
    <div data-theme={theme.theme} data-accent={theme.accent} className={`overflow-hidden rounded-lg bg-surface shadow-card ${className}`} style={style}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Partitura em página: leia linha por linha, ela rola sozinha no andamento da música"
        className="block h-full w-full"
      />
    </div>
  );
}
