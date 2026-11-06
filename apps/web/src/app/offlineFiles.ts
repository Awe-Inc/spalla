import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { SAMPLE_MIDIS, sampleUrl } from "@/audio/violinSampler";
import { libraryFileUrls } from "@/data/library";
import { PDFJS_OFFLINE_FILES, pdfjsAssetUrl } from "@/pdf/assets";

import { LIBRARY_CACHE, PDF_READER_CACHE, SAMPLES_CACHE } from "./offlineCaches";
import { canWarmNow, warmCaches, type OfflineGroup } from "./offlineWarmup";

function offlineGroups(baseUrl: string): OfflineGroup[] {
  return [
    { cacheName: SAMPLES_CACHE, urls: SAMPLE_MIDIS.map((midi) => sampleUrl(midi, baseUrl)) },
    { cacheName: PDF_READER_CACHE, urls: [pdfWorkerUrl, ...PDFJS_OFFLINE_FILES.map((file) => pdfjsAssetUrl(baseUrl, file))] },
    { cacheName: LIBRARY_CACHE, urls: libraryFileUrls() },
  ];
}

export async function warmOfflineFiles(): Promise<void> {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (!canWarmNow(connection, navigator.onLine)) return;
  await warmCaches(offlineGroups(import.meta.env.BASE_URL), window.caches);
}
