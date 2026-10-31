import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ClientModule = typeof import("./client");

async function loadClient(): Promise<ClientModule> {
  vi.resetModules();
  vi.stubEnv("VITE_API_URL", "http://api.test");
  return import("./client");
}

function rejectWith(error: unknown): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string, init: RequestInit) => {
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return Promise.reject(error);
  });
}

describe("api client", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("turns a request that takes too long into a readable error", async () => {
    const { api, ApiError } = await loadClient();
    vi.stubGlobal("fetch", rejectWith(new DOMException("slow", "TimeoutError")));
    const failure = await api.get("/me").catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as InstanceType<typeof ApiError>).code).toBe("tempo");
    expect((failure as Error).message).toContain("demorou demais");
  });

  it("gives every request a deadline even when the caller passes no signal", async () => {
    const { api } = await loadClient();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))));
    await api.get("/me");
    expect(timeout).toHaveBeenCalledWith(15_000);
    timeout.mockRestore();
  });

  it("keeps the caller's own cancellation as a cancellation, not a network error", async () => {
    const { api, ApiError } = await loadClient();
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", rejectWith(new DOMException("aborted", "AbortError")));
    const failure = await api.get("/me", controller.signal).catch((cause: unknown) => cause);
    expect(failure).not.toBeInstanceOf(ApiError);
    expect((failure as DOMException).name).toBe("AbortError");
  });

  it("reports an unreachable server as a network error", async () => {
    const { api } = await loadClient();
    vi.stubGlobal("fetch", rejectWith(new TypeError("Failed to fetch")));
    await expect(api.get("/me")).rejects.toMatchObject({ code: "rede" });
  });
});
