import type { PageText } from "./marks";
import type { InkImage } from "./raster";
import { leveledPage } from "./pageLeveling";
import { findStaves } from "./staves";

const MIN_WORD_CONFIDENCE = 50;
export const OCR_SCALE = 2;
const MAX_WORD_GAP_HEIGHTS = 1.5;
const STAFF_MARGIN_SPACES = 1;

export interface OcrWord {
  readonly text: string;
  readonly confidence: number;
  readonly bbox: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
}

export interface OcrPage {
  readonly blocks?: readonly { readonly paragraphs: readonly { readonly lines: readonly { readonly words: readonly OcrWord[] }[] }[] }[] | null;
}

interface PageBand {
  readonly top: number;
  readonly bottom: number;
}

const INK_GRAY = 0;
const PAPER_GRAY = 255;

export interface OcrImage {
  readonly gray: Uint8Array;
  readonly width: number;
  readonly height: number;
}

function staffBandsOf(image: InkImage): PageBand[] {
  return findStaves(image).map((staff) => {
    const margin = staff.spacing * STAFF_MARGIN_SPACES;
    return { top: Math.max(0, Math.floor(staff.top - margin)), bottom: Math.min(image.height, Math.ceil(staff.bottom + margin)) };
  });
}

export function ocrImageOf(source: InkImage): OcrImage {
  const image = leveledPage(source);
  const gray = new Uint8Array(image.width * image.height);
  image.ink.forEach((isInk, index) => {
    gray[index] = isInk ? INK_GRAY : PAPER_GRAY;
  });
  for (const band of staffBandsOf(image)) gray.fill(PAPER_GRAY, band.top * image.width, band.bottom * image.width);
  return enlarged({ gray, width: image.width, height: image.height });
}

function enlarged(image: OcrImage): OcrImage {
  const width = image.width * OCR_SCALE;
  const height = image.height * OCR_SCALE;
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = Math.floor(y / OCR_SCALE) * image.width;
    for (let x = 0; x < width; x += 1) gray[y * width + x] = image.gray[sourceRow + Math.floor(x / OCR_SCALE)] ?? PAPER_GRAY;
  }
  return { gray, width, height };
}

function pageTextOf(word: OcrWord): PageText {
  const { x0, y0, x1, y1 } = word.bbox;
  return { text: word.text, x: x0 / OCR_SCALE, y: y1 / OCR_SCALE, width: (x1 - x0) / OCR_SCALE, height: (y1 - y0) / OCR_SCALE };
}

function isReadable(word: OcrWord): boolean {
  return word.confidence >= MIN_WORD_CONFIDENCE && /\p{L}/u.test(word.text);
}

function phrasesOfLine(words: readonly OcrWord[]): PageText[] {
  const phrases: PageText[] = [];
  let isOpen = false;
  for (const word of words) {
    if (!isReadable(word)) {
      isOpen = false;
      continue;
    }
    const text = pageTextOf(word);
    const last = phrases.at(-1);
    if (isOpen && last && text.x - (last.x + last.width) <= Math.max(last.height, text.height) * MAX_WORD_GAP_HEIGHTS) {
      phrases[phrases.length - 1] = { ...last, text: `${last.text} ${text.text}`, width: text.x + text.width - last.x, y: Math.max(last.y, text.y), height: Math.max(last.height, text.height) };
    } else {
      phrases.push(text);
    }
    isOpen = true;
  }
  return phrases;
}

export function pageTextsFromOcr(page: OcrPage): PageText[] {
  return (page.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => phrasesOfLine(line.words))));
}
