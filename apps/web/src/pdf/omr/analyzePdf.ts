import type { PdfDocument } from "../pdfDocument";

import type { PageText } from "./marks";
import { inkFromRgba } from "./raster";
import { analyzePage, assembleStructure, type ScoreMeasure, type ScoreStructure } from "./structure";

const ANALYSIS_WIDTH_PX = 1600;

interface TextLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

function pageTextFrom(item: object, scale: number, toViewport: (x: number, y: number) => number[]): PageText | null {
  if (!("str" in item)) return null;
  return textFrom(item as TextLike, scale, toViewport);
}

function textFrom(item: TextLike, scale: number, toViewport: (x: number, y: number) => number[]): PageText | null {
  const text = item.str?.trim();
  const [, , , , originX, originY] = item.transform ?? [];
  if (!text || originX === undefined || originY === undefined) return null;
  const [x = 0, y = 0] = toViewport(originX, originY);
  return { text: item.str ?? text, x, y, width: (item.width ?? 0) * scale, height: (item.height ?? 0) * scale };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function abortError(): DOMException {
  return new DOMException("Leitura cancelada.", "AbortError");
}

async function analyzePdfPage(document: PdfDocument, pageIndex: number): Promise<{ measures: ScoreMeasure[]; textCount: number }> {
  const page = await document.getPage(pageIndex + 1);
  const scale = ANALYSIS_WIDTH_PX / page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("O navegador não deixou ler a imagem da página.");
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const content = await page.getTextContent();
  const texts = content.items.flatMap((item) => {
    const text = pageTextFrom(item, scale, (x, y) => viewport.convertToViewportPoint(x, y));
    return text ? [text] : [];
  });
  const measures = analyzePage(inkFromRgba(data, canvas.width, canvas.height), texts, pageIndex);
  canvas.width = 0;
  canvas.height = 0;
  return { measures, textCount: texts.length };
}

export async function analyzePdf(document: PdfDocument, onPage: (done: number, total: number) => void, signal: AbortSignal): Promise<ScoreStructure> {
  const pages: ScoreMeasure[][] = [];
  let textCount = 0;
  for (let index = 0; index < document.numPages; index += 1) {
    if (signal.aborted) throw abortError();
    onPage(index, document.numPages);
    await nextTurn();
    const result = await analyzePdfPage(document, index);
    pages.push(result.measures);
    textCount += result.textCount;
  }
  return assembleStructure(pages, textCount > 0);
}
