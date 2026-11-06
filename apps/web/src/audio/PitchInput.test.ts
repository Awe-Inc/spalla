import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetCompiledCore, PitchInput } from "./PitchInput";

class FakeContext {
  static created: FakeContext[] = [];
  state = "running";
  sampleRate = 48_000;
  baseLatency = 0;
  outputLatency = 0;
  audioWorklet = { addModule: vi.fn(async () => undefined) };
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createMediaStreamSource = () => ({ connect: () => undefined });

  constructor() {
    FakeContext.created.push(this);
  }
}

class FakeNode {
  static options: { processorOptions: { wasmModule?: unknown; wasmBinary?: unknown } }[] = [];
  static refuseModule = false;
  disconnect = vi.fn();
  port = {
    postMessage: vi.fn(),
    set onmessage(listener: (event: { data: unknown }) => void) {
      queueMicrotask(() => listener({ data: { type: "ready", requiredSamples: 2048, sampleRate: 48_000 } }));
    },
  };

  constructor(_context: unknown, _name: string, options: (typeof FakeNode.options)[number]) {
    if (FakeNode.refuseModule && options.processorOptions.wasmModule) throw new DOMException("no", "DataCloneError");
    FakeNode.options.push(options);
  }
}

const COMPILED = { compiled: true };
const fetchWasm = vi.fn(async () => new Response(new ArrayBuffer(8)));

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

async function started(input: PitchInput): Promise<void> {
  const pending = input.start(null);
  await settle();
  await pending;
}

describe("PitchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeContext.created = [];
    FakeNode.options = [];
    FakeNode.refuseModule = false;
    fetchWasm.mockClear();
    forgetCompiledCore();
    vi.stubGlobal("AudioContext", FakeContext);
    vi.stubGlobal("AudioWorkletNode", FakeNode);
    vi.stubGlobal("fetch", fetchWasm);
    vi.spyOn(WebAssembly, "compile").mockResolvedValue(COMPILED as unknown as WebAssembly.Module);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [], getAudioTracks: () => [] })) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reuses the context, the worklet and the compiled core on the next start", async () => {
    const input = new PitchInput();
    await started(input);
    await input.stop();
    await started(input);

    expect(FakeContext.created).toHaveLength(1);
    expect(FakeContext.created[0]?.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(fetchWasm).toHaveBeenCalledTimes(1);
    expect(FakeNode.options[1]?.processorOptions.wasmModule).toBe(COMPILED);
  });

  it("shares the compiled core between inputs", async () => {
    await started(new PitchInput());
    await started(new PitchInput());
    expect(fetchWasm).toHaveBeenCalledTimes(1);
  });

  it("suspends only after the tails of what was playing are gone", async () => {
    const input = new PitchInput();
    await started(input);
    await input.stop();
    const context = FakeContext.created[0];

    expect(context?.suspend).not.toHaveBeenCalled();
    expect(input.context).toBeNull();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(context?.suspend).toHaveBeenCalledTimes(1);
    expect(context?.close).not.toHaveBeenCalled();
  });

  it("does not suspend a context that started again in time", async () => {
    const input = new PitchInput();
    await started(input);
    await input.stop();
    await started(input);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeContext.created[0]?.suspend).not.toHaveBeenCalled();
  });

  it("closes the context when disposed", async () => {
    const input = new PitchInput();
    await started(input);
    await input.dispose();
    expect(FakeContext.created[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("creates a new context if the browser closed the idle one", async () => {
    const input = new PitchInput();
    await started(input);
    await input.stop();
    if (FakeContext.created[0]) FakeContext.created[0].state = "closed";
    await started(input);
    expect(FakeContext.created).toHaveLength(2);
    expect(FakeContext.created[1]?.audioWorklet.addModule).toHaveBeenCalledTimes(1);
  });

  it("falls back to the bytes where the browser cannot send a compiled module to the worklet", async () => {
    FakeNode.refuseModule = true;
    await started(new PitchInput());
    expect(FakeNode.options[0]?.processorOptions.wasmBinary).toBeInstanceOf(ArrayBuffer);
    expect(FakeNode.options[0]?.processorOptions.wasmModule).toBeUndefined();
  });

  it("fetches again after a failed download", async () => {
    fetchWasm.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const input = new PitchInput();
    const failing = input.start(null).catch((error: Error) => error.message);
    await settle();
    expect(await failing).toContain("503");
    await started(input);
    expect(fetchWasm).toHaveBeenCalledTimes(2);
  });
});
