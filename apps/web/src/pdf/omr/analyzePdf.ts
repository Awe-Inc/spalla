import type { PdfDocument } from "../pdfDocument";

import type { PageText } from "./marks";
import { inferMeter, type TimedMeasure } from "./meter";
import { inkFromRgba, type InkImage } from "./raster";
import { readPageNotes, settleKeys, type ReadMeasure } from "./readPage";
import { analyzePage, assembleStructure, type ScoreMeasure, type ScoreStructure } from "./structure";
import { tempoFromTexts } from "./tempoText";
import { withReadTiming } from "./timing";
import type { ScanReader } from "./scanText";
import { withinTime } from "./timeLimit";

const ANALYSIS_WIDTH_PX = 1600;

interface TextLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface RenderedPage {
  readonly ink: InkImage;
  readonly texts: readonly PageText[];
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

async function renderForReading(document: PdfDocument, pageIndex: number): Promise<RenderedPage> {
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
  const ink = inkFromRgba(data, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
  return { ink, texts };
}

const OCR_PAGE_LIMIT_MS = 60_000;

function lazyScanReader(): ScanReader {
  let opened: Promise<ScanReader> | null = null;
  return {
    async read(ink) {
      opened ??= import("./scanText").then(({ openScanReader }) => openScanReader());
      return (await opened).read(ink);
    },
    async close() {
      const closing = opened;
      opened = null;
      if (closing) await (await closing).close();
    },
  };
}

async function textsOfScan(reader: ScanReader, ink: InkImage): Promise<readonly PageText[] | null> {
  try {
    return await withinTime(reader.read(ink), OCR_PAGE_LIMIT_MS);
  } catch {
    reader.close().catch(() => undefined);
    return null;
  }
}

export async function analyzePdf(document: PdfDocument, onPage: (done: number, total: number) => void, signal: AbortSignal): Promise<ScoreStructure> {
  const pages: ScoreMeasure[][] = [];
  const read: ReadMeasure[] = [];
  const allTexts: string[] = [];
  let textCount = 0;
  let ocrPages = 0;
  let canUseOcr = true;
  const scanReader = lazyScanReader();
  const closeOnAbort = () => {
    scanReader.close().catch(() => undefined);
  };
  signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    for (let index = 0; index < document.numPages; index += 1) {
      if (signal.aborted) throw abortError();
      onPage(index, document.numPages);
      await nextTurn();
      const rendered = await renderForReading(document, index);
      textCount += rendered.texts.length;
      const withoutOcr = analyzePage(rendered.ink, rendered.texts, index);
      const wantsOcr = canUseOcr && rendered.texts.length === 0 && withoutOcr.length > 0;
      const scanTexts = wantsOcr ? await textsOfScan(scanReader, rendered.ink) : null;
      if (wantsOcr && !scanTexts) canUseOcr = false;
      if (scanTexts) ocrPages += 1;
      const texts = scanTexts ?? rendered.texts;
      allTexts.push(...texts.map((text) => text.text));
      if (scanTexts && scanTexts.length > 0) await nextTurn();
      const measures = scanTexts && scanTexts.length > 0 ? analyzePage(rendered.ink, scanTexts, index) : withoutOcr;
      pages.push(measures);
      await nextTurn();
      read.push(...readPageNotes(rendered.ink, measures));
    }
  } finally {
    signal.removeEventListener("abort", closeOnAbort);
    closeOnAbort();
  }
  const structure = { ...assembleStructure(pages, textCount > 0), ...(ocrPages > 0 ? { ocrRead: true } : {}) };
  return withReadTiming(structure, inferMeter(settleKeys(read)), tempoFromTexts(allTexts));
}

export async function readScoreNotes(document: PdfDocument, measures: readonly ScoreMeasure[], onPage: (done: number, total: number) => void, signal: AbortSignal): Promise<TimedMeasure[]> {
  const read: ReadMeasure[] = [];
  const pageNumbers = [...new Set(measures.map((measure) => measure.page))];
  for (const [done, page] of pageNumbers.entries()) {
    if (signal.aborted) throw abortError();
    onPage(done, pageNumbers.length);
    await nextTurn();
    const rendered = await renderForReading(document, page);
    read.push(...readPageNotes(rendered.ink, measures.filter((measure) => measure.page === page)));
  }
  return inferMeter(settleKeys(read));
}
