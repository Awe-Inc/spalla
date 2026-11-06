import { createWorker, OEM, PSM, type Worker } from "tesseract.js";

import { ocrAssetUrls } from "../ocrAssets";

import type { PageText } from "./marks";
import { pageTextsFromOcr, type OcrImage, type OcrPage } from "./scanWords";

const OCR_LANGUAGE = "eng";
const CHANNELS = 4;
const OPAQUE = 255;

export interface ScanReader {
  read(image: OcrImage): Promise<readonly PageText[]>;
  close(): Promise<void>;
}

async function openReader(): Promise<Worker> {
  const worker = await createWorker(OCR_LANGUAGE, OEM.LSTM_ONLY, { ...ocrAssetUrls(new URL(import.meta.env.BASE_URL, window.location.href).href), workerBlobURL: false });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  return worker;
}

function canvasOf({ gray, width, height }: OcrImage): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const rgba = new Uint8ClampedArray(width * height * CHANNELS);
  for (let index = 0; index < gray.length; index += 1) {
    const level = gray[index] ?? 0;
    const start = index * CHANNELS;
    rgba[start] = level;
    rgba[start + 1] = level;
    rgba[start + 2] = level;
    rgba[start + CHANNELS - 1] = OPAQUE;
  }
  const context = canvas.getContext("2d");
  if (!context) throw new Error("O navegador não deixou preparar a imagem para o OCR.");
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

export function openScanReader(): ScanReader {
  let opened: Promise<Worker> | null = null;
  return {
    async read(image) {
      opened ??= openReader();
      const worker = await opened;
      const canvas = canvasOf(image);
      try {
        const { data } = await worker.recognize(canvas, {}, { blocks: true });
        return pageTextsFromOcr(data as OcrPage);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
    async close() {
      const closing = opened;
      opened = null;
      if (closing) await (await closing).terminate();
    },
  };
}
