import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { WeekSummary } from "@/data/weekSummary";

import { ResumoDaSemana } from "./ResumoDaSemana";

const summary: WeekSummary = {
  from: "2026-10-22",
  to: "2026-10-28",
  dayCount: 7,
  minutes: 35,
  daysPracticed: 2,
  runs: 3,
  exercisesPlayed: 2,
  tasksDone: 1,
  tasksOpen: 1,
  weakest: { exerciseId: "suzuki.twinkle", accuracyPct: 60 },
  drift: "baixo",
};

describe("ResumoDaSemana", () => {
  it("lists the week and copies it as plain text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ResumoDaSemana summary={summary} titleOf={() => "Twinkle - Tema"} />);

    expect(screen.getByRole("heading", { name: "Resumo da semana De 22/10 a 28/10" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Onde errou mais: Twinkle - Tema (60% de afinação).")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copiar para a professora" }));
    expect(writeText).toHaveBeenCalledWith(
      ["Resumo da semana · De 22/10 a 28/10", "Praticou 2 de 7 dias, 35 minutos no total.", "3 execuções de 2 exercícios.", "Tarefas da aula: 1 feita, 1 aberta.", "Onde errou mais: Twinkle - Tema (60% de afinação).", "Tendência: as notas saem baixas."].join("\n"),
    );
    expect(screen.getByRole("button", { name: "Copiado" })).toBeInTheDocument();
  });
});
