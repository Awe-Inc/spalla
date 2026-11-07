import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useUndo } from "./undo";

function Harness({ restore }: { restore: () => Promise<void> }) {
  const { offerUndo, undoNotice } = useUndo();
  return (
    <div>
      {undoNotice}
      <button type="button" onClick={() => offerUndo({ message: "A música saiu.", restore })}>
        Apagar
      </button>
    </div>
  );
}

describe("useUndo", () => {
  it("shows nothing until something is removed", () => {
    render(<Harness restore={vi.fn()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("announces the removal and moves focus to Desfazer", () => {
    render(<Harness restore={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    expect(screen.getByRole("status")).toHaveTextContent("A música saiu.");
    expect(screen.getByRole("button", { name: "Desfazer" })).toHaveFocus();
  });

  it("does not go away by itself", () => {
    vi.useFakeTimers();
    try {
      render(<Harness restore={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
      act(() => {
        vi.advanceTimersByTime(600000);
      });
      expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores, closes and keeps focus in the page", async () => {
    const restore = vi.fn().mockResolvedValue(undefined);
    render(<Harness restore={restore} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(restore).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("closes without restoring and keeps focus in the page", () => {
    const restore = vi.fn();
    render(<Harness restore={restore} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar aviso" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(restore).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("keeps the offer and says so when the restore fails", async () => {
    render(<Harness restore={vi.fn().mockRejectedValue(new Error("cheio"))} />);
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText("Não deu para trazer de volta.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
  });
});
