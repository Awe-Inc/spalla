import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSettings } from "@/app/settings";

const fake = vi.hoisted(() => ({ setGoal: vi.fn(async () => undefined), persist: vi.fn(async () => true) }));

vi.mock("@/core/useCore", () => ({ useCore: () => ({ status: "loading" }) }));
vi.mock("@/audio/usePitchInput", () => ({
  usePitchInput: () => ({ status: { status: "idle" }, frame: null, start: vi.fn(), stop: vi.fn() }),
}));
vi.mock("@/audio/PitchInput", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/audio/PitchInput")>()),
  listInputDevices: async () => [],
}));
vi.mock("@/data/progress", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/progress")>()),
  setDailyGoal: fake.setGoal,
}));
vi.mock("@/data/storageUsage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/storageUsage")>()),
  requestPersistentStorage: fake.persist,
}));

import { BoasVindasPage } from "./BoasVindasPage";

function show() {
  return render(
    <MemoryRouter initialEntries={["/boas-vindas"]}>
      <Routes>
        <Route path="/boas-vindas" element={<BoasVindasPage />} />
        <Route path="/" element={<p>Tela Hoje</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function advance(times: number) {
  for (let index = 0; index < times; index += 1) {
    fireEvent.click(screen.getByRole("button", { name: /^(Próximo|Continuar)$/ }));
  }
}

describe("BoasVindasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.setGoal.mockResolvedValue(undefined);
    useSettings.setState({ onboardedAt: null });
  });

  afterEach(cleanup);

  it("walks through the steps and comes back", () => {
    show();
    expect(screen.getByRole("heading", { name: "Bem-vindo ao Spalla." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeDisabled();
    advance(1);
    expect(screen.getByRole("heading", { name: "Quanto tempo por dia?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("heading", { name: "Bem-vindo ao Spalla." })).toBeInTheDocument();
  });

  it("saves the chosen goal and opens the app at the end", async () => {
    show();
    advance(3);
    fireEvent.click(screen.getByRole("radio", { name: /Leve/ }));
    advance(1);
    fireEvent.click(screen.getByRole("button", { name: "Começar agora" }));
    expect(await screen.findByText("Tela Hoje")).toBeInTheDocument();
    expect(fake.setGoal).toHaveBeenCalledWith(30);
    expect(fake.persist).toHaveBeenCalled();
    expect(useSettings.getState().onboardedAt).not.toBeNull();
  });

  it("does not trap the student when the goal fails to save", async () => {
    fake.setGoal.mockRejectedValue(new Error("cheio"));
    show();
    advance(4);
    fireEvent.click(screen.getByRole("button", { name: "Começar agora" }));
    expect(await screen.findByText("Tela Hoje")).toBeInTheDocument();
    expect(useSettings.getState().onboardedAt).not.toBeNull();
  });
});
