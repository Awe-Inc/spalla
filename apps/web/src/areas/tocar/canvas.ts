import { useEffect, useRef, useState, type RefObject } from "react";

import type { FrameSource, ScoreFrame } from "./liveRun";

export interface CanvasSize {
  width: number;
  height: number;
}

const MAX_PIXEL_RATIO = 2;

export function canvasPixelRatio(deviceRatio: number): number {
  return Math.min(deviceRatio || 1, MAX_PIXEL_RATIO);
}

export function useCanvasSize(ref: RefObject<HTMLCanvasElement | null>): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const next = { width: Math.round(width), height: Math.round(height) };
      setSize((current) => (current.width === next.width && current.height === next.height ? current : next));
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function fitCanvas(canvas: HTMLCanvasElement, size: CanvasSize): CanvasRenderingContext2D | null {
  if (size.width === 0 || size.height === 0) return null;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  const ratio = canvasPixelRatio(window.devicePixelRatio);
  const pixelWidth = Math.round(size.width * ratio);
  const pixelHeight = Math.round(size.height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

export type FramePaint<P> = (ctx: CanvasRenderingContext2D, size: CanvasSize, palette: P, frame: ScoreFrame) => void;

interface FramePainterOptions<P> {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  readPalette: (canvas: HTMLCanvasElement) => P;
  paletteKey?: string;
  paint: FramePaint<P>;
  frame: ScoreFrame;
  live?: FrameSource | undefined;
}

export function useFramePainter<P>({ canvasRef, readPalette, paletteKey = "", paint, frame, live }: FramePainterOptions<P>): void {
  const size = useCanvasSize(canvasRef);
  const paletteRef = useRef<{ key: string; palette: P } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas ? fitCanvas(canvas, size) : null;
    if (!canvas || !ctx) return;
    if (paletteRef.current?.key !== paletteKey) paletteRef.current = { key: paletteKey, palette: readPalette(canvas) };
    const { palette } = paletteRef.current;
    const draw = () => paint(ctx, size, palette, live?.get() ?? frame);
    draw();
    return live?.subscribe(draw);
  }, [canvasRef, readPalette, paletteKey, paint, frame, live, size]);
}
