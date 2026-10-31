import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { watchDatabaseOpen } from "./databaseHealth";
import { DatabaseNotice } from "./DatabaseNotice";

const TITLE = "Este navegador não deixou o Spalla guardar dados.";

describe("DatabaseNotice", () => {
  it("warns when the local database cannot open and clears once it does", async () => {
    render(<DatabaseNotice />);
    expect(screen.queryByText(TITLE)).toBeNull();

    await act(() => watchDatabaseOpen(() => Promise.reject(new Error("blocked"))));
    expect(screen.getByRole("alert")).toHaveTextContent(TITLE);

    await act(() => watchDatabaseOpen(() => Promise.resolve()));
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
