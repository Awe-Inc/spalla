export const PDFJS_ASSETS_DIR = "pdfjs";
export const PDFJS_ASSET_FOLDERS = ["cmaps", "standard_fonts", "wasm", "iccs"] as const;
export const PDFJS_ASSET_EXTENSIONS = ["bcmap", "pfb", "ttf", "wasm", "js", "icc"] as const;

const SCRIPTING_SANDBOX_PREFIX = "quickjs";

export type PdfjsAssetFolder = (typeof PDFJS_ASSET_FOLDERS)[number];

export interface PdfjsAssetUrls {
  cMapUrl: string;
  standardFontDataUrl: string;
  wasmUrl: string;
  iccUrl: string;
}

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export function pdfjsAssetFolderUrl(baseUrl: string, folder: PdfjsAssetFolder): string {
  return `${withTrailingSlash(baseUrl)}${PDFJS_ASSETS_DIR}/${folder}/`;
}

export function pdfjsAssetUrls(baseUrl: string): PdfjsAssetUrls {
  return {
    cMapUrl: pdfjsAssetFolderUrl(baseUrl, "cmaps"),
    standardFontDataUrl: pdfjsAssetFolderUrl(baseUrl, "standard_fonts"),
    wasmUrl: pdfjsAssetFolderUrl(baseUrl, "wasm"),
    iccUrl: pdfjsAssetFolderUrl(baseUrl, "iccs"),
  };
}

export function isPdfjsAssetFile(fileName: string): boolean {
  const baseName = fileName.split(/[\\/]/).pop() ?? "";
  const extension = baseName.includes(".") ? baseName.slice(baseName.lastIndexOf(".") + 1) : "";
  return (PDFJS_ASSET_EXTENSIONS as readonly string[]).includes(extension) && !baseName.startsWith(SCRIPTING_SANDBOX_PREFIX);
}
