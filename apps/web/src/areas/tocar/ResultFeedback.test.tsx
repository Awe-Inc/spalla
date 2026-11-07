import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NoteError } from "./feedback";
import type { MeasureStat } from "./measureMap";
import { ErrorSummary, MeasureMap } from "./ResultFeedback";

const ERRORS: NoteError[] = [{ eventIndex: 0, measureIndex: 0, noteName: "A4", string: 1, kind: "afinacao", direction: "baixa" }];
const MEASURES = [
  { measureIndex: 0, measureNumber: 1, accuracyPct: 50 },
  { measureIndex: 1, measureNumber: 2, accuracyPct: null },
] as MeasureStat[];

describe("ErrorSummary", () => {
  it("stays out of the way when nothing went wrong", () => {
    const { container } = render(<ErrorSummary errors={[]} naming="letters" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says which notes went wrong and why", () => {
    render(<ErrorSummary errors={ERRORS} naming="letters" />);
    expect(screen.getByText("A4 na corda Ré. 1 baixa.")).toBeInTheDocument();
    expect(screen.getByText(/Afinação:/)).toBeInTheDocument();
  });
});

describe("MeasureMap", () => {
  it("shows each measure's number and result as text, not only colour", () => {
    render(<MeasureMap perMeasure={MEASURES} errors={ERRORS} naming="letters" />);
    expect(screen.getByRole("button", { name: "Compasso 1: 50% certas" })).toHaveTextContent("150%");
    expect(screen.getByRole("button", { name: "Compasso 2: não tocado" })).toHaveTextContent("2—");
  });

  it("explains a measure when it is chosen and folds it back", () => {
    render(<MeasureMap perMeasure={MEASURES} errors={ERRORS} naming="letters" />);
    const measure = screen.getByRole("button", { name: "Compasso 1: 50% certas" });
    fireEvent.click(measure);
    expect(measure).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Afinação: A4 na corda Ré/)).toHaveAttribute("aria-live", "polite");
    fireEvent.click(measure);
    expect(measure).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Toque num compasso para ver o que aconteceu nele.")).toBeInTheDocument();
  });

  it("repeats only the chosen measure", () => {
    const onRepeat = vi.fn();
    render(<MeasureMap perMeasure={MEASURES} errors={ERRORS} naming="letters" onRepeat={onRepeat} />);
    fireEvent.click(screen.getByRole("button", { name: "Compasso 1: 50% certas" }));
    fireEvent.click(screen.getByRole("button", { name: /Repetir o compasso 1/ }));
    expect(onRepeat).toHaveBeenCalledWith({ firstIndex: 0, lastIndex: 0 });
  });

  it("does not offer to repeat a measure that was not played, nor without a handler", () => {
    const { rerender } = render(<MeasureMap perMeasure={MEASURES} errors={ERRORS} naming="letters" onRepeat={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Compasso 2: não tocado" }));
    expect(screen.queryByRole("button", { name: /Repetir/ })).not.toBeInTheDocument();
    rerender(<MeasureMap perMeasure={MEASURES} errors={ERRORS} naming="letters" />);
    fireEvent.click(screen.getByRole("button", { name: "Compasso 1: 50% certas" }));
    expect(screen.queryByRole("button", { name: /Repetir/ })).not.toBeInTheDocument();
  });
});
