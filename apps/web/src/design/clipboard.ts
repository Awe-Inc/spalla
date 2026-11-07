export const COPY_FAILED_MESSAGE = "Não deu para copiar. Selecione o texto e copie à mão.";

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
