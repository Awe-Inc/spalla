import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoadState } from "@/account/ui";

import { ApiError } from "./client";
import { useApiData } from "./useApiData";

const NO_CONNECTION = new ApiError(0, "rede", "Não deu para falar com o servidor.");

describe("useApiData", () => {
  it("marks a network failure as disconnected and tries again when the internet returns", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(NO_CONNECTION).mockResolvedValue("turmas");
    const { result } = renderHook(() => useApiData(load, []));
    await waitFor(() => expect(result.current.isDisconnected).toBe(true));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.data).toBe("turmas"));
    expect(result.current.isDisconnected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("does not call a server error a lost connection", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValue(new ApiError(500, "erro", "O servidor respondeu com erro 500."));
    const { result } = renderHook(() => useApiData(load, []));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.isDisconnected).toBe(false);
    window.dispatchEvent(new Event("online"));
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("LoadState", () => {
  const baseState = { data: undefined, error: "falhou", loading: false };

  it("shows the disconnected state with a way to retry", () => {
    const reload = vi.fn();
    render(
      <LoadState {...baseState} isDisconnected reload={reload}>
        {() => null}
      </LoadState>,
    );

    expect(screen.getByRole("alert").textContent).toContain("Sem conexão");
    act(() => screen.getByRole("button", { name: "Tentar de novo" }).click());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps showing data already loaded when the connection drops", () => {
    render(
      <LoadState {...baseState} data="turmas" isDisconnected>
        {(data) => <p>{data}</p>}
      </LoadState>,
    );

    expect(screen.getByText("turmas")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
