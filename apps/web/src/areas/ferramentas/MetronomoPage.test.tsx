import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSettings } from "@/app/settings";

const clock = vi.hoisted(() => ({
  start: vi.fn(async () => undefined),
  stop: vi.fn(),
  beat: null as ((beat: number) => void) | null,
}));

vi.mock("@/audio/tempoClock", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/audio/tempoClock")>();
  class FakeClock {
    readonly currentBpm = 72;
    start = clock.start;
    stop = clock.stop;
    update = vi.fn();
    onMeasure = vi.fn();
    onBeat(callback: (beat: number) => void) {
      clock.beat = callback;
    }
    dispose = vi.fn(async () => undefined);
  }
  return { ...original, TempoClock: FakeClock };
});

import { MetronomoPage } from "./MetronomoPage";

function show() {
  return render(
    <MemoryRouter>
      <MetronomoPage />
    </MemoryRouter>,
  );
}

describe("MetronomoPage", () => {
  beforeEach(() => {
    clock.start.mockClear();
    clock.stop.mockClear();
    clock.beat = null;
    useSettings.setState({ metronomeBpm: 72, metronomeSound: "madeira" });
  });

  afterEach(cleanup);

  it("opens on the tempo used last time", () => {
    useSettings.setState({ metronomeBpm: 96 });
    show();
    expect(screen.getByText("96")).toBeInTheDocument();
  });

  it("remembers a tempo typed by tapping", () => {
    const now = vi.spyOn(performance, "now");
    show();
    const tap = screen.getByRole("button", { name: "Bater o andamento" });
    now.mockReturnValue(1000);
    fireEvent.click(tap);
    now.mockReturnValue(1500);
    fireEvent.click(tap);
    now.mockRestore();
    expect(useSettings.getState().metronomeBpm).toBe(120);
  });

  it("starts and stops with the space bar", async () => {
    show();
    fireEvent.keyDown(window, { key: " " });
    await screen.findByRole("button", { name: "Parar" });
    expect(clock.start).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: " " });
    await waitFor(() => expect(clock.stop).toHaveBeenCalled());
  });

  it("stops on a press that arrives right after the start, before the page rendered", async () => {
    show();
    fireEvent.keyDown(window, { key: " " });
    await Promise.resolve();
    await Promise.resolve();
    fireEvent.keyDown(window, { key: " " });
    expect(clock.start).toHaveBeenCalledOnce();
    expect(clock.stop).toHaveBeenCalledOnce();
    await screen.findByRole("button", { name: "Começar" });
  });

  it("leaves the space bar alone on a held key and inside a control", () => {
    show();
    fireEvent.keyDown(window, { key: " ", repeat: true });
    fireEvent.keyDown(screen.getByRole("button", { name: "Começar" }), { key: " " });
    expect(clock.start).not.toHaveBeenCalled();
  });

  it("marks the current beat and clears it when stopped", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Começar" }));
    await screen.findByRole("button", { name: "Parar" });
    act(() => clock.beat?.(2));
    const dots = screen.getByTestId("pulso").children;
    expect(dots[2]).toHaveAttribute("data-active", "true");
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    await waitFor(() => expect(screen.getByTestId("pulso").querySelector('[data-active="true"]')).toBeNull());
  });
});
