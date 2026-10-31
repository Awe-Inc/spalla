const QUOTA_ERROR_NAME = "QuotaExceededError";

export function isQuotaError(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  if (cause.name === QUOTA_ERROR_NAME) return true;
  const inner: unknown = (cause as Error & { inner?: unknown }).inner;
  return inner instanceof Error && inner.name === QUOTA_ERROR_NAME;
}

export function describeStorageError(cause: unknown, subject: string): string {
  if (isQuotaError(cause)) return `O aparelho está sem espaço para guardar ${subject}. Apague gravações ou PDFs que não usa mais.`;
  return `Não deu para guardar ${subject}. Tente de novo.`;
}
