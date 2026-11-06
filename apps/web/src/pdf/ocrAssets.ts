export const OCR_ASSETS_DIR = "ocr";
export const OCR_WORKER_FILE = "worker.min.js";
export const OCR_LANGUAGE_FILE = "eng.traineddata.gz";
export const OCR_CORE_FILES = ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"] as const;

interface OcrAssetUrls {
  readonly workerPath: string;
  readonly corePath: string;
  readonly langPath: string;
}

export function ocrAssetUrls(baseUrl: string): OcrAssetUrls {
  const folder = `${baseUrl.replace(/\/$/, "")}/${OCR_ASSETS_DIR}`;
  return { workerPath: `${folder}/${OCR_WORKER_FILE}`, corePath: folder, langPath: folder };
}
