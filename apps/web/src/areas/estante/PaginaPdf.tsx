import { useEffect, useRef, useState, type MouseEvent } from "react";

import type { PageFit } from "@/pdf/fit";
import { cancelRender, isRenderCancelled, renderPdfPage, type PdfDocument } from "@/pdf/pdfDocument";

interface PaginaPdfProps {
  document: PdfDocument;
  page: number;
  fit: PageFit;
  onTap: (xRatio: number) => void;
  onRendered: () => void;
  onError: (message: string) => void;
}

interface Size {
  width: number;
  height: number;
}

const EMPTY: Size = { width: 0, height: 0 };

function sameSize(a: Size, b: Size): boolean {
  return a.width === b.width && a.height === b.height;
}

export function PaginaPdf({ document, page, fit, onTap, onRendered, onError }: PaginaPdfProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [box, setBox] = useState<Size>(EMPTY);

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = { width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) };
      setBox((current) => (sameSize(current, next) ? current : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = 0;
  }, [page]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || box.width === 0) return;
    const controller = new AbortController();
    renderPdfPage(document, page, canvas, box, fit, window.devicePixelRatio || 1, controller.signal)
      .then(() => {
        if (!controller.signal.aborted) onRendered();
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isRenderCancelled(error)) return;
        onError(error instanceof Error ? error.message : "A página não desenhou.");
      });
    return () => {
      controller.abort();
      cancelRender(canvas);
    };
  }, [document, page, fit, box, onRendered, onError]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    onTap((event.clientX - rect.left) / rect.width);
  }

  return (
    <div ref={boxRef} className={`h-full w-full ${fit === "largura" ? "overflow-y-auto" : "overflow-hidden"}`} onClick={handleClick}>
      <div className="flex min-h-full items-start justify-center">
        <canvas ref={canvasRef} role="img" className="shadow-card" aria-label={`Página ${page}`} />
      </div>
    </div>
  );
}
