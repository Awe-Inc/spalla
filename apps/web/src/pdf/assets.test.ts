import { describe, expect, it } from "vitest";

import { isPdfjsAssetFile, pdfjsAssetUrls } from "./assets";

describe("pdfjsAssetUrls", () => {
  it("points every pdf.js asset folder under the app base with a trailing slash", () => {
    const urls = pdfjsAssetUrls("/fretless/");
    expect(urls.cMapUrl).toBe("/fretless/pdfjs/cmaps/");
    expect(urls.standardFontDataUrl).toBe("/fretless/pdfjs/standard_fonts/");
    expect(urls.wasmUrl).toBe("/fretless/pdfjs/wasm/");
    expect(urls.iccUrl).toBe("/fretless/pdfjs/iccs/");
  });

  it("accepts a base without the trailing slash", () => {
    expect(pdfjsAssetUrls("/").cMapUrl).toBe("/pdfjs/cmaps/");
    expect(pdfjsAssetUrls("/app").cMapUrl).toBe("/app/pdfjs/cmaps/");
  });
});

describe("isPdfjsAssetFile", () => {
  it("accepts the files pdf.js fetches at render time", () => {
    expect(isPdfjsAssetFile("78-H.bcmap")).toBe(true);
    expect(isPdfjsAssetFile("FoxitSerif.pfb")).toBe(true);
    expect(isPdfjsAssetFile("LiberationSans-Regular.ttf")).toBe(true);
    expect(isPdfjsAssetFile("openjpeg.wasm")).toBe(true);
    expect(isPdfjsAssetFile("openjpeg_nowasm_fallback.js")).toBe(true);
    expect(isPdfjsAssetFile("CGATS001Compat-v2-micro.icc")).toBe(true);
  });

  it("rejects licences, the scripting sandbox and files without a known extension", () => {
    expect(isPdfjsAssetFile("LICENSE")).toBe(false);
    expect(isPdfjsAssetFile("LICENSE_FOXIT")).toBe(false);
    expect(isPdfjsAssetFile("quickjs-eval.wasm")).toBe(false);
    expect(isPdfjsAssetFile("quickjs-eval.js")).toBe(false);
    expect(isPdfjsAssetFile("package.json")).toBe(false);
  });

  it("judges the file name even when given a full path", () => {
    expect(isPdfjsAssetFile("C:\\pkg\\pdfjs-dist\\wasm\\quickjs-eval.wasm")).toBe(false);
    expect(isPdfjsAssetFile("/pkg/pdfjs-dist/wasm/qcms_bg.wasm")).toBe(true);
  });
});
