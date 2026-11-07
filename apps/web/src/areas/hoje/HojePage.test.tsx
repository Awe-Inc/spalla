import "fake-indexeddb/auto";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_USER_STATS } from "@/data/db";

const fake = vi.hoisted(() => ({ plan: null as unknown, grant: vi.fn(async () => undefined) }));

vi.mock("@/core/useCore", () => ({ useCore: () => ({ status: "loading" }) }));

vi.mock("./useTodayPlan", () => ({
  useTodayPlan: () => fake.plan,
}));

vi.mock("@/data/progress", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/progress")>()),
  grantSessionBonus: fake.grant,
}));

import { HojePage } from "./HojePage";

function plan(changes: Record<string, unknown> = {}) {
  return {
    today: "2026-11-06",
    routine: { name: "Rotina curta", durationMinutes: 20 },
    routines: [],
    plan: [],
    runsToday: new Map(),
    next: null,
    progress: { done: 0, total: 3 },
    todayXp: 0,
    todayMinutes: 0,
    sessionCompleted: false,
    streak: 0,
    stats: DEFAULT_USER_STATS,
    coreReady: true,
    coreError: null,
    ...changes,
  };
}

function show() {
  return render(
    <MemoryRouter>
      <HojePage />
    </MemoryRouter>,
  );
}

describe("HojePage", () => {
  beforeEach(() => {
    fake.grant.mockReset();
    fake.grant.mockResolvedValue(undefined);
    fake.plan = plan();
  });

  afterEach(cleanup);

  it("shows the session in progress without a bonus", () => {
    show();
    expect(screen.getByRole("heading", { name: "Sessão de hoje" })).toBeInTheDocument();
    expect(screen.getByText("0 de 3 blocos")).toBeInTheDocument();
    expect(fake.grant).not.toHaveBeenCalled();
  });

  it("hides the blocks and the play button while the core loads", () => {
    fake.plan = plan({ coreReady: false });
    show();
    expect(screen.queryByRole("list", { name: "Blocos da sessão" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Tocar agora/ })).not.toBeInTheDocument();
  });

  it("closes the session and grants the bonus once it is all done", async () => {
    fake.plan = plan({ progress: { done: 3, total: 3 } });
    show();
    expect(screen.getByRole("heading", { name: "Sessão fechada" })).toBeInTheDocument();
    expect(screen.getByText(/Tudo feito\./)).toBeInTheDocument();
    await waitFor(() => expect(fake.grant).toHaveBeenCalledWith("2026-11-06"));
  });

  it("does not grant the bonus twice", () => {
    fake.plan = plan({ progress: { done: 3, total: 3 }, sessionCompleted: true });
    show();
    expect(fake.grant).not.toHaveBeenCalled();
  });

  it("does not treat an empty plan as done", () => {
    fake.plan = plan({ progress: { done: 0, total: 0 } });
    show();
    expect(screen.getByRole("heading", { name: "Sessão de hoje" })).toBeInTheDocument();
    expect(fake.grant).not.toHaveBeenCalled();
  });

  it("warns when the bonus was not saved", async () => {
    fake.grant.mockRejectedValue(new Error("cheio"));
    fake.plan = plan({ progress: { done: 3, total: 3 } });
    show();
    expect(await screen.findByText("O bônus da sessão não foi guardado.")).toBeInTheDocument();
  });

  it("offers the next exercise", () => {
    const item = { title: "Escala de Ré", playPath: "/tocar/escala" };
    fake.plan = plan({ next: { item, block: { type: "warmup" } } });
    show();
    expect(screen.getByText("Escala de Ré")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tocar agora: Escala de Ré" })).toBeInTheDocument();
  });
});
