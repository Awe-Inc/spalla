import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button, ConfirmButton, IconButton, Menu } from "./actions";

describe("Button", () => {
  it("is busy and disabled while loading", () => {
    render(<Button loading>Guardar</Button>);
    const button = screen.getByRole("button", { name: /Guardar/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("type", "button");
  });
});

describe("IconButton", () => {
  it("exposes its label as the accessible name and tooltip", () => {
    render(<IconButton icon="ouvir" label="Ouvir trecho" />);
    const button = screen.getByRole("button", { name: "Ouvir trecho" });
    expect(button).toHaveAttribute("title", "Ouvir trecho");
  });
});

describe("ConfirmButton", () => {
  it("asks inline before running the action, and focuses the confirmation", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Apagar trecho" confirmLabel="Apagar" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar trecho" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Tem certeza?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apagar" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Apagar trecho" })).toBeInTheDocument();
  });

  it("goes back without running the action on Cancelar", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Apagar trecho" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar trecho" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("returns focus to the button after confirming", () => {
    render(<ConfirmButton label="Apagar trecho" confirmLabel="Apagar" onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar trecho" }));
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    expect(screen.getByRole("button", { name: "Apagar trecho" })).toHaveFocus();
  });

  it("returns focus to the button after cancelling", () => {
    render(<ConfirmButton label="Apagar trecho" onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar trecho" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Apagar trecho" })).toHaveFocus();
  });

  it("cancels on Escape", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Apagar trecho" confirmLabel="Apagar" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar trecho" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Apagar" }), { key: "Escape" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apagar trecho" })).toHaveFocus();
  });

  it("does not take the focus when it first appears", () => {
    render(<ConfirmButton label="Apagar trecho" onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Apagar trecho" })).not.toHaveFocus();
  });
});

describe("Menu", () => {
  const items = (onRename: () => void, onDelete: () => void) => [
    { label: "Renomear", onSelect: onRename },
    { label: "Apagar", onSelect: onDelete, tone: "danger" as const },
  ];

  it("opens, moves with the arrow keys, runs an item and closes", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(<Menu label="Ações do trecho" items={items(onRename, onDelete)} />);
    const trigger = screen.getByRole("button", { name: "Ações do trecho" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Renomear" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Apagar" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Renomear" })).toHaveFocus();
    fireEvent.click(screen.getByRole("menuitem", { name: "Apagar" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("jumps to the ends with Home and End", () => {
    render(<Menu label="Ações do trecho" items={items(vi.fn(), vi.fn())} />);
    fireEvent.click(screen.getByRole("button", { name: "Ações do trecho" }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "End" });
    expect(screen.getByRole("menuitem", { name: "Apagar" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(screen.getByRole("menuitem", { name: "Renomear" })).toHaveFocus();
  });

  it("closes on Tab and lets the focus move on", () => {
    render(<Menu label="Ações do trecho" items={items(vi.fn(), vi.fn())} />);
    fireEvent.click(screen.getByRole("button", { name: "Ações do trecho" }));
    const notPrevented = fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
    expect(notPrevented).toBe(true);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape and on a click outside", () => {
    render(
      <>
        <Menu label="Ações do trecho" items={items(vi.fn(), vi.fn())} />
        <p>fora</p>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Ações do trecho" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByText("fora"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
