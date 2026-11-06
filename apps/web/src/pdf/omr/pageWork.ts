import type { PageText } from "./marks";
import { createPageSession, type PageReply, type PageRequest } from "./pageSession";
import type { ReadMeasure } from "./readPage";
import type { OcrImage } from "./scanWords";
import type { ScoreMeasure } from "./structure";

export interface PageWork {
  open(rgba: Uint8ClampedArray, width: number, height: number): Promise<void>;
  measures(texts: readonly PageText[], page: number): Promise<ScoreMeasure[]>;
  ocrImage(): Promise<OcrImage>;
  notes(measures: readonly ScoreMeasure[]): Promise<ReadMeasure[]>;
  close(): void;
}

export class PageWorkFailed extends Error {}

export type PageWorker = Pick<Worker, "postMessage" | "terminate" | "addEventListener">;

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function abortError(): DOMException {
  return new DOMException("Leitura cancelada.", "AbortError");
}

export function inlinePageWork(): PageWork {
  const session = createPageSession();
  const afterTurn = async <T>(step: () => T): Promise<T> => {
    await nextTurn();
    return step();
  };
  return {
    open: (rgba, width, height) => afterTurn(() => session.open(rgba, width, height)),
    measures: (texts, page) => afterTurn(() => session.measures(texts, page)),
    ocrImage: () => afterTurn(() => session.ocrImage()),
    notes: (measures) => afterTurn(() => session.notes(measures)),
    close: () => undefined,
  };
}

type PendingReply = { resolve: (value: unknown) => void; reject: (reason: unknown) => void };
type WithoutId<Request> = Request extends unknown ? Omit<Request, "id"> : never;
type PageRequestBody = WithoutId<PageRequest>;

export function workerPageWork(worker: PageWorker): PageWork {
  const pending = new Map<number, PendingReply>();
  let nextId = 0;
  let stopped: Error | null = null;

  const stop = (reason: Error) => {
    stopped = reason;
    worker.terminate();
    for (const reply of pending.values()) reply.reject(reason);
    pending.clear();
  };
  const fail = () => stop(new PageWorkFailed("O worker de leitura parou."));

  worker.addEventListener("message", (event: MessageEvent<PageReply>) => {
    const reply = pending.get(event.data.id);
    if (!reply) return;
    pending.delete(event.data.id);
    if (event.data.ok) reply.resolve(event.data.value);
    else reply.reject(new Error(event.data.message));
  });
  worker.addEventListener("error", fail);
  worker.addEventListener("messageerror", fail);

  const ask = <T>(body: PageRequestBody, transfer: Transferable[] = []): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (stopped) {
        reject(stopped);
        return;
      }
      nextId += 1;
      pending.set(nextId, { resolve: (value) => resolve(value as T), reject });
      worker.postMessage({ ...body, id: nextId }, { transfer });
    });

  return {
    open: (rgba, width, height) => ask<void>({ kind: "open", rgba, width, height }, [rgba.buffer as ArrayBuffer]),
    measures: (texts, page) => ask<ScoreMeasure[]>({ kind: "measures", texts, page }),
    ocrImage: () => ask<OcrImage>({ kind: "ocrImage" }),
    notes: (measures) => ask<ReadMeasure[]>({ kind: "notes", measures }),
    close: () => {
      if (!stopped) stop(abortError());
    },
  };
}

function openPageWork(): PageWork {
  try {
    return workerPageWork(new Worker(new URL("./pageWorker.ts", import.meta.url), { type: "module" }));
  } catch {
    return inlinePageWork();
  }
}

export interface ResilientPageWork {
  run<T>(task: (work: PageWork) => Promise<T>): Promise<T>;
  close(): void;
}

export function resilientPageWork(open: () => PageWork = openPageWork): ResilientPageWork {
  let work = open();
  return {
    async run(task) {
      try {
        return await task(work);
      } catch (error) {
        if (!(error instanceof PageWorkFailed)) throw error;
        work = inlinePageWork();
        return task(work);
      }
    },
    close: () => work.close(),
  };
}
