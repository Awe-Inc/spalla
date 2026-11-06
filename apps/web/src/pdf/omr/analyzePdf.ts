import type { PdfDocument } from "../pdfDocument";

import type { PageText } from "./marks";
import { inferMeter, type TimedMeasure } from "./meter";
import { abortError, resilientPageWork, type PageWork } from "./pageWork";
import { settleKeys, type ReadMeasure } from "./readPage";
import { assembleStructure, type ScoreMeasure, type ScoreStructure } from "./structure";
import { tempoFromTexts } from "./tempoText";
import { withReadTiming } from "./timing";
import type { ScanReader } from "./scanText";
import type { OcrImage } from "./scanWords";
import { withinTime } from "./timeLimit";

const ANALYSIS_WIDTH_PX = 1600;

interface TextLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface RenderedPage {
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
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
  const { width, height } = canvas;
  canvas.width = 0;
  canvas.height = 0;
  return { rgba: data, width, height, texts };
}

const OCR_PAGE_LIMIT_MS = 60_000;

function lazyScanReader(): ScanReader {
  let opened: Promise<ScanReader> | null = null;
  return {
    async read(image) {
      opened ??= import("./scanText").then(({ openScanReader }) => openScanReader());
      return (await opened).read(image);
    },
    async close() {
      const closing = opened;
      opened = null;
      if (closing) await (await closing).close();
    },
  };
}

async function textsOfScan(reader: ScanReader, image: OcrImage): Promise<readonly PageText[] | null> {
  try {
    return await withinTime(reader.read(image), OCR_PAGE_LIMIT_MS);
  } catch {
    reader.close().catch(() => undefined);
    return null;
  }
}

interface PageReading {
  readonly measures: ScoreMeasure[];
  readonly notes: ReadMeasure[];
  readonly texts: readonly PageText[];
  readonly hadTextLayer: boolean;
  readonly usedOcr: boolean;
  readonly ocrFailed: boolean;
}

async function openRenderedPage(work: PageWork, document: PdfDocument, page: number): Promise<RenderedPage> {
  const rendered = await renderForReading(document, page);
  await work.open(rendered.rgba, rendered.width, rendered.height);
  return rendered;
}

async function readWholePage(work: PageWork, document: PdfDocument, index: number, reader: ScanReader | null): Promise<PageReading> {
  const { texts: layerTexts } = await openRenderedPage(work, document, index);
  const withoutOcr = await work.measures(layerTexts, index);
  const wantsOcr = reader !== null && layerTexts.length === 0 && withoutOcr.length > 0;
  const scanTexts = wantsOcr ? await textsOfScan(reader, await work.ocrImage()) : null;
  const measures = scanTexts && scanTexts.length > 0 ? await work.measures(scanTexts, index) : withoutOcr;
  return {
    measures,
    notes: await work.notes(measures),
    texts: scanTexts ?? layerTexts,
    hadTextLayer: layerTexts.length > 0,
    usedOcr: scanTexts !== null,
    ocrFailed: wantsOcr && scanTexts === null,
  };
}

export async function analyzePdf(document: PdfDocument, onPage: (done: number, total: number) => void, signal: AbortSignal): Promise<ScoreStructure> {
  const pages: ScoreMeasure[][] = [];
  const read: ReadMeasure[] = [];
  const allTexts: string[] = [];
  let hasTextLayer = false;
  let ocrPages = 0;
  let canUseOcr = true;
  const scanReader = lazyScanReader();
  const pageWork = resilientPageWork();
  const closeAll = () => {
    pageWork.close();
    scanReader.close().catch(() => undefined);
  };
  signal.addEventListener("abort", closeAll, { once: true });
  try {
    for (let index = 0; index < document.numPages; index += 1) {
      if (signal.aborted) throw abortError();
      onPage(index, document.numPages);
      const page = await pageWork.run((work) => readWholePage(work, document, index, canUseOcr ? scanReader : null));
      hasTextLayer ||= page.hadTextLayer;
      if (page.ocrFailed) canUseOcr = false;
      if (page.usedOcr) ocrPages += 1;
      allTexts.push(...page.texts.map((text) => text.text));
      pages.push(page.measures);
      read.push(...page.notes);
    }
  } finally {
    signal.removeEventListener("abort", closeAll);
    closeAll();
  }
  const structure = { ...assembleStructure(pages, hasTextLayer), ...(ocrPages > 0 ? { ocrRead: true } : {}) };
  return withReadTiming(structure, inferMeter(settleKeys(read)), tempoFromTexts(allTexts));
}

export async function readScoreNotes(document: PdfDocument, measures: readonly ScoreMeasure[], onPage: (done: number, total: number) => void, signal: AbortSignal): Promise<TimedMeasure[]> {
  const read: ReadMeasure[] = [];
  const pageNumbers = [...new Set(measures.map((measure) => measure.page))];
  const pageWork = resilientPageWork();
  const closeWork = () => pageWork.close();
  signal.addEventListener("abort", closeWork, { once: true });
  try {
    for (const [done, page] of pageNumbers.entries()) {
      if (signal.aborted) throw abortError();
      onPage(done, pageNumbers.length);
      const notes = await pageWork.run(async (work) => {
        await openRenderedPage(work, document, page);
        return work.notes(measures.filter((measure) => measure.page === page));
      });
      read.push(...notes);
    }
  } finally {
    signal.removeEventListener("abort", closeWork);
    closeWork();
  }
  return inferMeter(settleKeys(read));
}
