import { apiBlob } from "@/api/client";

const PDF_URL_LIFETIME_MS = 60_000;

export async function openPdf(fileId: string): Promise<void> {
  const tab = window.open("about:blank", "_blank");
  try {
    const url = URL.createObjectURL(await fetchPdf(fileId));
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    window.setTimeout(() => URL.revokeObjectURL(url), PDF_URL_LIFETIME_MS);
  } catch (cause) {
    tab?.close();
    throw cause;
  }
}

export async function fetchPdf(fileId: string): Promise<Blob> {
  const blob = await apiBlob(`/files/${fileId}`);
  return new Blob([blob], { type: "application/pdf" });
}
