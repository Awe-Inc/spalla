import { loadCore, type FretlessCore } from "@fretless/core";
import { useEffect, useSyncExternalStore } from "react";

export type CoreStatus =
  | { status: "loading" }
  | { status: "ready"; core: FretlessCore }
  | { status: "error"; message: string };

const CORE_ERROR_MESSAGE = "Falha ao carregar o núcleo.";

let corePromise: Promise<FretlessCore> | null = null;
let coreState: CoreStatus = { status: "loading" };
const listeners = new Set<() => void>();

function setCoreState(next: CoreStatus): void {
  coreState = next;
  listeners.forEach((listener) => listener());
}

export function getCore(): Promise<FretlessCore> {
  if (!corePromise) {
    if (coreState.status === "error") setCoreState({ status: "loading" });
    corePromise = loadCore().then(
      (core) => {
        setCoreState({ status: "ready", core });
        return core;
      },
      (error: unknown) => {
        corePromise = null;
        setCoreState({ status: "error", message: error instanceof Error ? error.message : CORE_ERROR_MESSAGE });
        throw error;
      },
    );
  }
  return corePromise;
}

export function retryCore(): void {
  getCore().catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): CoreStatus {
  return coreState;
}

export function useCore(): CoreStatus {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (coreState.status === "loading") retryCore();
  }, []);

  return state;
}

export function resetCoreForTests(): void {
  corePromise = null;
  coreState = { status: "loading" };
}
