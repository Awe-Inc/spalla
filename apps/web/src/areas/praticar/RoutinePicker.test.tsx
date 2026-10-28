import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Routine } from "@/data/db";
import { blocksFromMinutes, DEFAULT_ROUTINE_MINUTES } from "@/data/routines";

import { RoutineEditor } from "./RoutinePicker";

function routine(): Routine {
  return { id: 7, name: "Rotina teste", durationMinutes: 15, blocks: blocksFromMinutes(DEFAULT_ROUTINE_MINUTES[15]), origin: "propria", createdAt: 0 };
}

function blockLabels(): string[] {
  return within(screen.getByRole("list", { name: "Blocos da rotina" }))
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("aria-label") ?? "");
}

describe("RoutineEditor", () => {
  it("moves a block with the keyboard buttons and keeps the first one from going up", async () => {
    const user = userEvent.setup();
    render(<RoutineEditor routine={routine()} onClose={() => undefined} />);
    expect(blockLabels().slice(0, 3)).toEqual(["1. Aquecimento", "2. Afinação", "3. Escalas e arpejos"]);
    expect(screen.getByRole("button", { name: "Subir Aquecimento" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Descer Aquecimento" }));
    expect(blockLabels().slice(0, 3)).toEqual(["1. Afinação", "2. Aquecimento", "3. Escalas e arpejos"]);
  });

  it("reorders by drag and drop", () => {
    render(<RoutineEditor routine={routine()} onClose={() => undefined} />);
    const items = within(screen.getByRole("list", { name: "Blocos da rotina" })).getAllByRole("listitem");
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: () => undefined };
    fireEvent.dragStart(items[5]!, { dataTransfer });
    fireEvent.dragOver(items[0]!, { dataTransfer });
    fireEvent.drop(items[0]!, { dataTransfer });
    expect(blockLabels()[0]).toBe("1. Revisão");
    expect(blockLabels()[1]).toBe("2. Aquecimento");
  });

  it("edits minutes and the goal of one block and shows the new total", async () => {
    const user = userEvent.setup();
    render(<RoutineEditor routine={routine()} onClose={() => undefined} />);
    expect(screen.getByRole("button", { name: "Salvar rotina de 15 min" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Minutos de Aquecimento" }), { target: { value: "7" } });
    expect(screen.getByRole("button", { name: "Salvar rotina de 20 min" })).toBeInTheDocument();
    const goal = screen.getByRole("combobox", { name: "Meta de Aquecimento" });
    expect(goal).toHaveValue("uma-vez");
    expect(screen.queryByRole("combobox", { name: "Quantidade da meta de Aquecimento" })).toBeNull();
    await user.selectOptions(goal, "repeticoes-limpas");
    const amount = screen.getByRole("combobox", { name: "Quantidade da meta de Aquecimento" });
    expect(amount).toHaveValue("3");
    await user.selectOptions(amount, "5");
    expect(amount).toHaveValue("5");
  });

  it("adds and removes blocks and warns about two equal neighbours", async () => {
    const user = userEvent.setup();
    render(<RoutineEditor routine={routine()} onClose={() => undefined} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo do bloco novo" }), "revisao");
    await user.click(screen.getByRole("button", { name: "Adicionar bloco" }));
    expect(blockLabels()).toHaveLength(7);
    expect(screen.getByText(/Dois blocos iguais seguidos/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Tirar Revisão" })[1]!);
    expect(blockLabels()).toHaveLength(6);
    expect(screen.queryByText(/Dois blocos iguais seguidos/)).toBeNull();
  });
});
