import { beforeEach, describe, expect, it, vi } from "vitest";

import { blankSketch } from "./omrFixtures";
import { openScanReader } from "./scanText";

interface FakeWorker {
  isTerminated: boolean;
  setParameters: () => Promise<void>;
  recognize: () => Promise<{ data: { blocks: never[] } }>;
  terminate: () => Promise<void>;
}

const { workers, RECOGNIZE_MS } = vi.hoisted(() => ({ workers: [] as unknown[], RECOGNIZE_MS: 20 }));

vi.mock("tesseract.js", () => ({
  OEM: { LSTM_ONLY: 1 },
  PSM: { SPARSE_TEXT: "11" },
  createWorker: async () => {
    const worker: FakeWorker = {
      isTerminated: false,
      setParameters: async () => undefined,
      recognize: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            if (!worker.isTerminated) resolve({ data: { blocks: [] } });
          }, RECOGNIZE_MS);
        }),
      terminate: async () => {
        worker.isTerminated = true;
      },
    };
    workers.push(worker);
    return worker;
  },
}));

const page = blankSketch(40, 40);

describe("leitor de OCR", () => {
  beforeEach(() => {
    workers.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ putImageData: () => undefined } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
    vi.stubGlobal("ImageData", class {});
  });

  it("fechar uma leitura não derruba a outra que está em andamento", async () => {
    const abandoned = openScanReader();
    const current = openScanReader();
    const abandonedReading = abandoned.read(page);
    await new Promise((resolve) => setTimeout(resolve, RECOGNIZE_MS / 2));
    const reading = current.read(page);
    await abandonedReading;
    await abandoned.close();

    const outcome = await Promise.race([reading, new Promise<string>((resolve) => setTimeout(() => resolve("travou"), RECOGNIZE_MS * 10))]);

    expect(outcome).toEqual([]);
  });

  it("só abre o motor quando a primeira página pede", async () => {
    const reader = openScanReader();
    expect(workers).toHaveLength(0);
    await reader.read(page);
    await reader.read(page);
    expect(workers).toHaveLength(1);
  });

  it("fechar sem ter lido nada não falha", async () => {
    await expect(openScanReader().close()).resolves.toBeUndefined();
  });
});
