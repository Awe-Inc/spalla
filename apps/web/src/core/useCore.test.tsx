import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadCore = vi.fn();

vi.mock("@fretless/core", () => ({ loadCore: () => loadCore() }));

const { resetCoreForTests, useCore } = await import("./useCore");
const { CoreErrorNotice } = await import("./CoreErrorNotice");

function Probe() {
  const core = useCore();
  return (
    <>
      <p>{core.status}</p>
      <CoreErrorNotice title="Não carregou." />
    </>
  );
}

describe("useCore", () => {
  beforeEach(() => {
    resetCoreForTests();
    loadCore.mockReset();
  });

  it("mostra o erro e volta a carregar quando o aluno pede outra tentativa", async () => {
    loadCore.mockRejectedValueOnce(new Error("Sem rede.")).mockResolvedValueOnce({});
    render(<Probe />);

    expect(await screen.findByText("error")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Sem rede.");

    await act(async () => {
      screen.getByRole("button", { name: "Tentar de novo" }).click();
    });

    expect(await screen.findByText("ready")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(loadCore).toHaveBeenCalledTimes(2);
  });

  it("carrega o núcleo uma vez só para todos os componentes", async () => {
    loadCore.mockResolvedValue({});
    render(
      <>
        <Probe />
        <Probe />
      </>,
    );
    expect(await screen.findAllByText("ready")).toHaveLength(2);
    expect(loadCore).toHaveBeenCalledTimes(1);
  });
});
