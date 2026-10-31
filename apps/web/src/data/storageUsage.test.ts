import { afterEach, describe, expect, it, vi } from "vitest";

import { formatBytes, readStorageUsage, requestPersistentStorage, storageUsageSentence } from "./storageUsage";

function stubStorage(storage: Partial<StorageManager>): void {
  vi.stubGlobal("navigator", { ...navigator, storage });
}

describe("storageUsage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("formats sizes the way the screen shows them", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(12 * 1024 * 1024)).toBe("12 MB");
    expect(formatBytes(2.25 * 1024 ** 3)).toBe("2,3 GB");
  });

  it("asks for persistence only when the data is not protected yet", async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorage({ persisted: () => Promise.resolve(true), persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();

    stubStorage({ persisted: () => Promise.resolve(false), persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("treats a browser without the API or a refusal as not protected", async () => {
    stubStorage({});
    expect(await requestPersistentStorage()).toBe(false);
    stubStorage({ persisted: () => Promise.reject(new Error("x")), persist: () => Promise.resolve(true) });
    expect(await requestPersistentStorage()).toBe(false);
    expect(await readStorageUsage()).toBeNull();
  });

  it("reads usage, quota and protection together", async () => {
    stubStorage({ estimate: () => Promise.resolve({ usage: 2048, quota: 4096 }), persisted: () => Promise.resolve(false) });
    const usage = await readStorageUsage();
    expect(usage).toEqual({ usageBytes: 2048, quotaBytes: 4096, persisted: false });
    expect(storageUsageSentence(usage!)).toBe(
      "Usando 2 KB de 4 KB disponíveis. Se o aparelho ficar sem espaço, o navegador pode apagar esses dados: exporte o backup de vez em quando.",
    );
  });
});
