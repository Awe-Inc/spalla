import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { cappedPixelRatio, pageScaleFor, type Box, type PageFit } from "./fit";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PdfDocument = PDFDocumentProxy;

const ABORTED_NAME = "RenderAborted";
const inFlightByCanvas = new WeakMap<HTMLCanvasElement, RenderTask>();

export function isRenderCancelled(error: unknown): boolean {
  return error instanceof Error && (error.name === "RenderingCancelledException" || error.name === ABORTED_NAME);
}

function abortedError(): Error {
  const error = new Error("Render abandonado.");
  error.name = ABORTED_NAME;
  return error;
}

export async function openPdf(bytes: Uint8Array): Promise<PdfDocument> {
  return getDocument({ data: bytes.slice() }).promise;
}

export async function closePdf(document: PdfDocument): Promise<void> {
  await document.loadingTask.destroy();
}

export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const document = await openPdf(bytes);
  try {
    return document.numPages;
  } finally {
    await closePdf(document);
  }
}

export interface RenderedPage {
  cssWidth: number;
  cssHeight: number;
}

export function cancelRender(canvas: HTMLCanvasElement): void {
  inFlightByCanvas.get(canvas)?.cancel();
  inFlightByCanvas.delete(canvas);
}

export async function renderPdfPage(document: PdfDocument, pageNumber: number, canvas: HTMLCanvasElement, box: Box, fit: PageFit, pixelRatio: number, signal?: AbortSignal): Promise<RenderedPage> {
  const page = await document.getPage(pageNumber);
  if (signal?.aborted) throw abortedError();
  const unscaled = page.getViewport({ scale: 1 });
  const scale = pageScaleFor({ width: unscaled.width, height: unscaled.height }, box, fit);
  const cssWidth = unscaled.width * scale;
  const cssHeight = unscaled.height * scale;
  const ratio = cappedPixelRatio(cssWidth, cssHeight, pixelRatio);
  const viewport = page.getViewport({ scale: scale * ratio });
  cancelRender(canvas);
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const task = page.render({ canvas, viewport });
  inFlightByCanvas.set(canvas, task);
  try {
    await task.promise;
  } finally {
    if (inFlightByCanvas.get(canvas) === task) inFlightByCanvas.delete(canvas);
  }
  return { cssWidth, cssHeight };
}
