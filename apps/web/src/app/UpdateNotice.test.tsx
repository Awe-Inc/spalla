import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dismissAppUpdate, offerAppUpdate } from "./appUpdate";
import { UpdateNotice } from "./UpdateNotice";

describe("UpdateNotice", () => {
  afterEach(() => {
    act(() => dismissAppUpdate());
  });

  it("stays hidden until the service worker offers a new version", () => {
    render(<UpdateNotice />);
    expect(screen.queryByText("Há uma versão nova do Spalla.")).toBeNull();
  });

  it("applies the update only when the player asks", async () => {
    const apply = vi.fn(() => Promise.resolve());
    render(<UpdateNotice />);
    act(() => offerAppUpdate(apply));
    expect(apply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(apply).toHaveBeenCalledOnce();
  });

  it("can be put off without updating", async () => {
    const apply = vi.fn(() => Promise.resolve());
    render(<UpdateNotice />);
    act(() => offerAppUpdate(apply));
    await userEvent.click(screen.getByRole("button", { name: "Depois" }));
    expect(screen.queryByText("Há uma versão nova do Spalla.")).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });
});
