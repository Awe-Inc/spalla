export interface StorageUsage {
  usageBytes: number;
  quotaBytes: number;
  persisted: boolean;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const UNIT_STEP = 1024;

function storageManager(): StorageManager | null {
  return typeof navigator !== "undefined" && navigator.storage ? navigator.storage : null;
}

export async function requestPersistentStorage(): Promise<boolean> {
  const storage = storageManager();
  if (!storage?.persist) return false;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

export async function readStorageUsage(): Promise<StorageUsage | null> {
  const storage = storageManager();
  if (!storage?.estimate) return null;
  const [estimate, persisted] = await Promise.all([storage.estimate(), storage.persisted ? storage.persisted() : Promise.resolve(false)]);
  return { usageBytes: estimate.usage ?? 0, quotaBytes: estimate.quota ?? 0, persisted };
}

export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= UNIT_STEP && unit < UNITS.length - 1) {
    value /= UNIT_STEP;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: digits })} ${UNITS[unit]}`;
}

export function storageUsageSentence(usage: StorageUsage): string {
  const used = `Usando ${formatBytes(usage.usageBytes)} de ${formatBytes(usage.quotaBytes)} disponíveis.`;
  const safety = usage.persisted
    ? "O navegador não apaga esses dados sozinho."
    : "Se o aparelho ficar sem espaço, o navegador pode apagar esses dados: exporte o backup de vez em quando.";
  return `${used} ${safety}`;
}
