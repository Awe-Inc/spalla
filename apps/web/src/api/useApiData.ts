import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage } from "./client";

export interface ApiData<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useApiData<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): ApiData<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadRef
      .current(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setData(value);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version, ...deps]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { data, error, loading, reload };
}

export function useAction(): {
  pending: boolean;
  error: string | null;
  run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
  clearError: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(action: () => Promise<T>) => {
    setPending(true);
    setError(null);
    try {
      return await action();
    } catch (cause) {
      setError(errorMessage(cause));
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);
  const clearError = useCallback(() => setError(null), []);
  return { pending, error, run, clearError };
}
