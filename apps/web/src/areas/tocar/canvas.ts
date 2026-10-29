import { useEffect, useState, type RefObject } from "react";

export interface CanvasSize {
  width: number;
  height: number;
}

export function useCanvasSize(ref: RefObject<HTMLCanvasElement | null>): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function fitCanvas(canvas: HTMLCanvasElement, size: CanvasSize): CanvasRenderingContext2D | null {
  if (size.width === 0 || size.height === 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== size.width * ratio || canvas.height !== size.height * ratio) {
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}
