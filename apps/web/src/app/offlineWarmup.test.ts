import { describe, expect, it, vi } from "vitest";

import { canWarmNow, warmCaches } from "./offlineWarmup";

function fakeStorage(stored: string[] = []) {
  const add = vi.fn(async (url: string) => {
    stored.push(url);
  });
  const cache = { match: vi.fn(async (url: string) => (stored.includes(url) ? ({} as Response) : undefined)), add };
  return { open: vi.fn(async () => cache as unknown as Cache), add };
}

describe("warmCaches", () => {
  it("baixa só o que ainda não está guardado, um de cada vez", async () => {
    const storage = fakeStorage(["a"]);
    await warmCaches([{ cacheName: "x", urls: ["a", "b", "c"] }], storage);
    expect(storage.add.mock.calls.map(([url]) => url)).toEqual(["b", "c"]);
  });

  it("para no primeiro erro de rede para tentar de novo na próxima abertura", async () => {
    const storage = fakeStorage();
    storage.add.mockRejectedValueOnce(new Error("sem rede"));
    await expect(warmCaches([{ cacheName: "x", urls: ["a", "b"] }], storage)).rejects.toThrow("sem rede");
    expect(storage.add).toHaveBeenCalledTimes(1);
  });
});

describe("canWarmNow", () => {
  it("respeita a economia de dados e a falta de rede", () => {
    expect(canWarmNow(undefined, true)).toBe(true);
    expect(canWarmNow({ saveData: true }, true)).toBe(false);
    expect(canWarmNow(undefined, false)).toBe(false);
  });
});
