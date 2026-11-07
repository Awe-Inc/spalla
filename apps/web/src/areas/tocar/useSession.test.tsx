import "fake-indexeddb/auto";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const session = {
    score: { beatsPerMinute: 80, tempoScale: 1, events: [], measures: [] },
    measureRange: null as unknown,
    setLeadInSeconds: vi.fn(),
    loadExercise: vi.fn(() => true),
    loadMusicXml: vi.fn(() => ({ ok: true })),
    setTempoScale: vi.fn(),
    setMeasureRange: vi.fn(),
    dispose: vi.fn(),
  };
  const exercise = { id: "scale", title: "Escala", defaultBpm: 80, minBpm: 40, maxBpm: 120 };
  const core = { createSession: () => session, findExercise: vi.fn((id: string) => (id === "scale" ? exercise : undefined)) };
  return { session, exercise, core, value: { status: "ready", core } as unknown };
});

vi.mock("@/core/useCore", () => ({ useCore: () => fake.value }));

import { LEAD_IN_SECONDS, useSession } from "./useSession";

describe("useSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.value = { status: "ready", core: fake.core };
    fake.session.measureRange = null;
  });

  afterEach(cleanup);

  it("waits for the core before creating anything", () => {
    fake.value = { status: "loading" };
    const { result } = renderHook(() => useSession("scale", undefined));
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("loads the exercise with the lead-in", async () => {
    const { result } = renderHook(() => useSession("scale", undefined));
    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(fake.session.setLeadInSeconds).toHaveBeenCalledWith(LEAD_IN_SECONDS);
    expect(result.current.exercise).toBe(fake.exercise);
    expect(result.current.resultId).toBe("scale");
    expect(result.current.bpm).toBe(80);
  });

  it("says when the exercise does not exist and frees the session", async () => {
    const { result } = renderHook(() => useSession("nada", undefined));
    await waitFor(() => expect(result.current.error).toBe("Esse exercício não existe."));
    expect(fake.session.dispose).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
  });

  it("frees the session on unmount", async () => {
    const { result, unmount } = renderHook(() => useSession("scale", undefined));
    await waitFor(() => expect(result.current.session).not.toBeNull());
    unmount();
    expect(fake.session.dispose).toHaveBeenCalledOnce();
  });

  it("says a stored piece is gone instead of waiting forever", async () => {
    const { result } = renderHook(() => useSession(undefined, "999999"));
    await waitFor(() => expect(result.current.error).toMatch(/não está mais na biblioteca/));
  });

  it("reports the loop the session accepted", async () => {
    const { result } = renderHook(() => useSession("scale", undefined));
    await waitFor(() => expect(result.current.session).not.toBeNull());
    const range = { firstMeasure: 1, lastMeasure: 2 };
    fake.session.measureRange = range;
    act(() => result.current.setLoop(range as never));
    expect(fake.session.setMeasureRange).toHaveBeenCalledWith(range);
    expect(result.current.loop).toBe(range);
  });

  it("clamps the tempo to the exercise limits before giving it to the session", async () => {
    const { result } = renderHook(() => useSession("scale", undefined));
    await waitFor(() => expect(result.current.session).not.toBeNull());
    act(() => result.current.setBpm(100000));
    expect(fake.session.setTempoScale).toHaveBeenCalledWith(1.5);
  });
});
