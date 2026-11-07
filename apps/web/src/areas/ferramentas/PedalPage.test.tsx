import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSettings } from "@/app/settings";

vi.mock("@/core/useCore", () => ({ useCore: () => ({ status: "loading" }) }));

import { PedalPage } from "./PedalPage";

const NOTICE = /Use fone/;

function show() {
  return render(
    <MemoryRouter>
      <PedalPage />
    </MemoryRouter>,
  );
}

describe("PedalPage headphones", () => {
  beforeEach(() => useSettings.setState({ headphonesConfirmedAt: null }));
  afterEach(cleanup);

  it("asks once and remembers across visits", () => {
    const first = show();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Estou de fone" }));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(useSettings.getState().headphonesConfirmedAt).not.toBeNull();
    first.unmount();
    show();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
