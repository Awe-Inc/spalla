export function describeMicError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "O navegador bloqueou o microfone. Permita o acesso e tente de novo.";
    if (error.name === "NotFoundError") return "Nenhum microfone encontrado. Conecte um e tente de novo.";
    if (error.name === "NotReadableError") return "Outro programa está usando o microfone. Feche-o e tente de novo.";
    return `Não foi possível abrir o microfone (${error.name}).`;
  }
  return error instanceof Error ? error.message : "Não foi possível abrir o microfone.";
}

export function isStaleDevice(error: unknown): boolean {
  return error instanceof DOMException && error.name === "OverconstrainedError";
}
