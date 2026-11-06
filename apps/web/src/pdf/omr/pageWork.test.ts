import { describe, expect, it, vi } from "vitest";

import { answerPageRequest, createPageSession, type PageReply, type PageRequest } from "./pageSession";
import { PageWorkFailed, inlinePageWork, resilientPageWork, workerPageWork, type PageWork, type PageWorker } from "./pageWork";

type Listeners = Record<string, ((event: never) => void)[]>;

function fakeWorker(answer: (request: PageRequest) => PageReply | null = (request) => answerPageRequest(createPageSession(), request).reply) {
  const listeners: Listeners = {};
  const emit = (kind: string, event: unknown) => (listeners[kind] ?? []).forEach((listener) => listener(event as never));
  const worker = {
    terminate: vi.fn(),
    addEventListener: (kind: string, listener: (event: never) => void) => {
      listeners[kind] = [...(listeners[kind] ?? []), listener];
    },
    postMessage: vi.fn((request: PageRequest, _options?: StructuredSerializeOptions) => {
      const reply = answer(request);
      if (reply) queueMicrotask(() => emit("message", { data: reply }));
    }),
  };
  return { worker: worker as unknown as PageWorker, terminate: worker.terminate, postMessage: worker.postMessage, emit };
}

function whitePage(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4).fill(255);
}

describe("workerPageWork", () => {
  it("entrega a resposta do worker e transfere os pixels em vez de copiar", async () => {
    const { worker, postMessage } = fakeWorker();
    const work = workerPageWork(worker);
    const rgba = whitePage(4, 4);
    await work.open(rgba, 4, 4);
    expect(postMessage.mock.calls[0]?.[1]).toEqual({ transfer: [rgba.buffer] });
  });

  it("erro do cálculo chega como erro comum, sem trocar de caminho", async () => {
    const { worker } = fakeWorker((request) => ({ id: request.id, ok: false, message: "Página ilegível" }));
    await expect(workerPageWork(worker).measures([], 0)).rejects.toThrow("Página ilegível");
  });

  it("worker que cai rejeita o que estava esperando como falha do worker", async () => {
    const { worker, emit, terminate } = fakeWorker(() => null);
    const waiting = workerPageWork(worker).measures([], 0);
    emit("error", {});
    await expect(waiting).rejects.toBeInstanceOf(PageWorkFailed);
    expect(terminate).toHaveBeenCalled();
  });

  it("fechar para o cálculo na hora e a leitura termina como cancelada", async () => {
    const { worker, terminate } = fakeWorker(() => null);
    const work = workerPageWork(worker);
    const waiting = work.notes([]);
    work.close();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(terminate).toHaveBeenCalledTimes(1);
    await expect(work.measures([], 0)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("resilientPageWork", () => {
  it("refaz a página na thread principal quando o worker falha", async () => {
    const seen: PageWork[] = [];
    const broken = { close: vi.fn() } as unknown as PageWork;
    const pageWork = resilientPageWork(() => broken);
    const result = await pageWork.run(async (work) => {
      seen.push(work);
      if (work === broken) throw new PageWorkFailed("caiu");
      return "lida";
    });
    expect(result).toBe("lida");
    expect(seen).toHaveLength(2);
    expect(seen[1]).not.toBe(broken);
  });

  it("não refaz quando o erro é do cálculo ou do cancelamento", async () => {
    const task = vi.fn(async () => {
      throw new DOMException("Leitura cancelada.", "AbortError");
    });
    await expect(resilientPageWork(() => inlinePageWork()).run(task)).rejects.toMatchObject({ name: "AbortError" });
    expect(task).toHaveBeenCalledTimes(1);
  });
});

describe("answerPageRequest", () => {
  it("pedir antes de abrir a página responde com erro, sem derrubar o worker", () => {
    const { reply } = answerPageRequest(createPageSession(), { id: 7, kind: "notes", measures: [] });
    expect(reply).toEqual({ id: 7, ok: false, message: "Nenhuma página aberta para ler." });
  });

  it("a imagem do OCR sai por transferência", () => {
    const session = createPageSession();
    session.open(whitePage(20, 20), 20, 20);
    const { reply, transfer } = answerPageRequest(session, { id: 1, kind: "ocrImage" });
    expect(reply.ok).toBe(true);
    expect(transfer).toHaveLength(1);
  });
});
