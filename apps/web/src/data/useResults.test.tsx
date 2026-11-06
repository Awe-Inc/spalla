import "fake-indexeddb/auto";

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, type ExerciseResult } from "./db";
import { useResults } from "./useResults";

function result(exerciseId: string): ExerciseResult {
  return { exerciseId, stars: 2, accuracyPct: 90, playedAt: 1, meanSignedCents: 0, bpm: 60, durationSeconds: 30 };
}

describe("useResults", () => {
  beforeEach(async () => {
    await db.results.clear();
    await db.results.add(result("a"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the table once for every screen using it at the same time", async () => {
    const read = vi.spyOn(db.results, "toArray");
    const first = renderHook(() => useResults());
    const second = renderHook(() => useResults());
    await waitFor(() => expect(first.result.current).toHaveLength(1));
    expect(second.result.current).toBe(first.result.current);
    expect(read).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
  });

  it("keeps the read alive when a screen replaces another", async () => {
    const first = renderHook(() => useResults());
    await waitFor(() => expect(first.result.current).toHaveLength(1));
    const read = vi.spyOn(db.results, "toArray");
    first.unmount();
    const second = renderHook(() => useResults());
    expect(second.result.current).toHaveLength(1);
    expect(read).not.toHaveBeenCalled();
    second.unmount();
  });

  it("follows a new result saved while the screen is open", async () => {
    const { result: hook, unmount } = renderHook(() => useResults());
    await waitFor(() => expect(hook.current).toHaveLength(1));
    await db.results.add(result("b"));
    await waitFor(() => expect(hook.current.map((row) => row.exerciseId).sort()).toEqual(["a", "b"]));
    unmount();
  });
});
