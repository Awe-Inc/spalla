import { useSyncExternalStore } from "react";

export interface ExternalValue<T> {
  get: () => T;
  set: (next: T) => void;
  use: () => T;
}

export function externalValue<T>(initial: T): ExternalValue<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const get = () => value;
  return {
    get,
    set: (next) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    use: () => useSyncExternalStore(subscribe, get, get),
  };
}
