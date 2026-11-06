import { describe, expect, it } from "vitest";

import { ocrAssetUrls } from "./ocrAssets";

describe("arquivos do OCR", () => {
  it("resolve as URLs dentro da base do app, com ou sem barra", () => {
    const expected = { workerPath: "https://x.dev/spalla/ocr/worker.min.js", corePath: "https://x.dev/spalla/ocr", langPath: "https://x.dev/spalla/ocr" };
    expect(ocrAssetUrls("https://x.dev/spalla/")).toEqual(expected);
    expect(ocrAssetUrls("https://x.dev/spalla")).toEqual(expected);
  });
});
