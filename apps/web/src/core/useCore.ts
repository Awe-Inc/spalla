import { loadCore, type FretlessCore } from "@fretless/core";
import { useEffect, useState } from "react";

let corePromise: Promise<FretlessCore> | null = null;
let loadedCore: FretlessCore | null = null;

export function getCore(): Promise<FretlessCore> {
  if (!corePromise) {
    corePromise = loadCore().then(
      (core) => {
        loadedCore = core;
        return core;
      },
      (error: unknown) => {
        corePromise = null;
        throw error;
      },
    );
  }
  return corePromise;
}

export type CoreStatus =
  | { status: "loading" }
  | { status: "ready"; core: FretlessCore }
  | { status: "error"; message: string };

export function useCore(): CoreStatus {
  const [state, setState] = useState<CoreStatus>(() => (loadedCore ? { status: "ready", core: loadedCore } : { status: "loading" }));

  useEffect(() => {
    if (loadedCore) return;
    let cancelled = false;
    getCore()
      .then((core) => {
        if (!cancelled) setState({ status: "ready", core });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: error instanceof Error ? error.message : "Falha ao carregar o núcleo." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
