import { liveQuery } from "dexie";
import { useSyncExternalStore } from "react";

import { db, type ExerciseResult } from "./db";

const NO_RESULTS: readonly ExerciseResult[] = [];
const RELEASE_DELAY_MS = 30_000;

const listeners = new Set<() => void>();
let snapshot = NO_RESULTS;
let failure: unknown = null;
let subscription: { unsubscribe(): void } | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function publish(): void {
  listeners.forEach((listener) => listener());
}

function open(): void {
  failure = null;
  subscription = liveQuery(() => db.results.toArray()).subscribe({
    next(rows) {
      snapshot = rows;
      publish();
    },
    error(error) {
      failure = error;
      publish();
    },
  });
}

function release(): void {
  releaseTimer = null;
  subscription?.unsubscribe();
  subscription = null;
  snapshot = NO_RESULTS;
  failure = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (subscription === null) open();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (failure !== null) release();
    else releaseTimer = setTimeout(release, RELEASE_DELAY_MS);
  };
}

function currentResults(): readonly ExerciseResult[] {
  return snapshot;
}

export function useResults(): readonly ExerciseResult[] {
  const results = useSyncExternalStore(subscribe, currentResults);
  if (failure !== null) throw failure;
  return results;
}
