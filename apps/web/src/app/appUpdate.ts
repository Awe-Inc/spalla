import { externalValue } from "./externalValue";

type ApplyUpdate = () => Promise<void>;

const pendingUpdate = externalValue<ApplyUpdate | null>(null);

export function offerAppUpdate(apply: ApplyUpdate): void {
  pendingUpdate.set(apply);
}

export function applyAppUpdate(): Promise<void> {
  return pendingUpdate.get()?.() ?? Promise.resolve();
}

export function dismissAppUpdate(): void {
  pendingUpdate.set(null);
}

export function useAppUpdateAvailable(): boolean {
  return pendingUpdate.use() !== null;
}
