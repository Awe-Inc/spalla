import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recorder = vi.hoisted(() => ({
  value: {
    status: "idle",
    error: null as string | null,
    elapsedMs: 0,
    take: null as { bytes: Uint8Array; mimeType: string; durationMs: number } | null,
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    discard: vi.fn(),
  },
}));

vi.mock("@/audio/useRecorder", () => ({ useRecorder: () => recorder.value }));

import { db } from "@/data/db";

import { GravadorPage } from "./GravadorPage";

function show() {
  return render(
    <MemoryRouter>
      <GravadorPage />
    </MemoryRouter>,
  );
}

describe("GravadorPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    Object.assign(recorder.value, { status: "idle", error: null, elapsedMs: 0, take: null });
    URL.createObjectURL = vi.fn(() => "blob:gravacao");
    URL.revokeObjectURL = vi.fn();
    await Promise.all([db.recordings.clear(), db.recordingFiles.clear()]);
  });

  afterEach(cleanup);

  it("starts when idle and stops while recording", () => {
    const first = show();
    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));
    expect(recorder.value.start).toHaveBeenCalledOnce();
    first.unmount();
    recorder.value.status = "recording";
    show();
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(recorder.value.stop).toHaveBeenCalledOnce();
  });

  it("blocks the button while the microphone opens", () => {
    recorder.value.status = "starting";
    show();
    expect(screen.getByRole("button", { name: "Gravar" })).toBeDisabled();
  });

  it("shows why the recorder did not open", () => {
    recorder.value.error = "Sem permissão.";
    show();
    expect(screen.getByText("O gravador não abriu.")).toBeInTheDocument();
    expect(screen.getByText(/Sem permissão\./)).toBeInTheDocument();
  });

  it("saves a new take with its bytes", async () => {
    recorder.value.take = { bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/webm", durationMs: 5000 };
    show();
    const name = screen.getByRole("textbox", { name: "Nome" });
    fireEvent.change(name, { target: { value: "Ensaio" } });
    fireEvent.submit(name.closest("form")!);
    await waitFor(() => expect(recorder.value.discard).toHaveBeenCalled());
    const [saved] = await db.recordings.toArray();
    expect(saved).toMatchObject({ name: "Ensaio", mimeType: "audio/webm", durationMs: 5000 });
    expect(await db.recordingFiles.get(saved!.id!)).toBeDefined();
  });

  it("says it is empty when there are no recordings", async () => {
    show();
    expect(await screen.findByText(/Nenhuma gravação aqui ainda/)).toBeInTheDocument();
  });
});
