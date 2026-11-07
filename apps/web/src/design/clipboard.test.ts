import { afterEach, describe, expect, it, vi } from "vitest";

import { copyToClipboard } from "./clipboard";

afterEach(() => vi.unstubAllGlobals());

describe("copyToClipboard", () => {
  it("copies and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyToClipboard("abc")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("abc");
  });

  it("reports a refusal instead of throwing", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("negado")) } });
    expect(await copyToClipboard("abc")).toBe(false);
  });

  it("reports a browser without clipboard access", async () => {
    vi.stubGlobal("navigator", {});
    expect(await copyToClipboard("abc")).toBe(false);
  });
});
