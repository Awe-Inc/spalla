import type { PageText } from "./marks";
import { inkFromRgba, type InkImage } from "./raster";
import { readPageNotes, type ReadMeasure } from "./readPage";
import { ocrImageOf, type OcrImage } from "./scanWords";
import { analyzePage, type ScoreMeasure } from "./structure";

export interface PageSession {
  open(rgba: Uint8ClampedArray, width: number, height: number): void;
  measures(texts: readonly PageText[], page: number): ScoreMeasure[];
  ocrImage(): OcrImage;
  notes(measures: readonly ScoreMeasure[]): ReadMeasure[];
}

export function createPageSession(): PageSession {
  let current: InkImage | null = null;
  const openedPage = (): InkImage => {
    if (!current) throw new Error("Nenhuma página aberta para ler.");
    return current;
  };
  return {
    open(rgba, width, height) {
      current = inkFromRgba(rgba, width, height);
    },
    measures: (texts, page) => analyzePage(openedPage(), texts, page),
    ocrImage: () => ocrImageOf(openedPage()),
    notes: (measures) => readPageNotes(openedPage(), measures),
  };
}

export type PageRequest =
  | { readonly id: number; readonly kind: "open"; readonly rgba: Uint8ClampedArray; readonly width: number; readonly height: number }
  | { readonly id: number; readonly kind: "measures"; readonly texts: readonly PageText[]; readonly page: number }
  | { readonly id: number; readonly kind: "ocrImage" }
  | { readonly id: number; readonly kind: "notes"; readonly measures: readonly ScoreMeasure[] };

export type PageReply = { readonly id: number; readonly ok: true; readonly value: unknown } | { readonly id: number; readonly ok: false; readonly message: string };

export interface AnsweredPageRequest {
  readonly reply: PageReply;
  readonly transfer: Transferable[];
}

function replyTo(session: PageSession, request: PageRequest): PageReply {
  switch (request.kind) {
    case "open":
      session.open(request.rgba, request.width, request.height);
      return { id: request.id, ok: true, value: null };
    case "measures":
      return { id: request.id, ok: true, value: session.measures(request.texts, request.page) };
    case "ocrImage":
      return { id: request.id, ok: true, value: session.ocrImage() };
    case "notes":
      return { id: request.id, ok: true, value: session.notes(request.measures) };
  }
}

export function answerPageRequest(session: PageSession, request: PageRequest): AnsweredPageRequest {
  try {
    const reply = replyTo(session, request);
    const transfer = request.kind === "ocrImage" && reply.ok ? [(reply.value as OcrImage).gray.buffer as ArrayBuffer] : [];
    return { reply, transfer };
  } catch (error) {
    return { reply: { id: request.id, ok: false, message: error instanceof Error ? error.message : "A leitura da página falhou." }, transfer: [] };
  }
}
