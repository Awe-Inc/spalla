import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { List, ListRow, PageHeader, Stat, Stats, Tabs } from "./layout";

describe("Tabs", () => {
  it("marks the tab of the current route", () => {
    render(
      <MemoryRouter initialEntries={["/repertorio/suzuki"]}>
        <Tabs
          label="Repertório"
          items={[
            { to: "/repertorio", label: "Catálogo", end: true },
            { to: "/repertorio/suzuki", label: "Suzuki", count: 3 },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Repertório" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Suzuki/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Catálogo" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /Suzuki/ })).toHaveTextContent("3");
  });

  it("uses the explicit active flag for tabs that live in the query string", () => {
    render(
      <MemoryRouter initialEntries={["/x?aba=b"]}>
        <Tabs
          label="Partes"
          items={[
            { to: "?aba=a", label: "A", active: false },
            { to: "?aba=b", label: "B", active: true },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "B" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "A" })).not.toHaveAttribute("aria-current");
  });
});

describe("PageHeader", () => {
  it("renders the back link, the heading and the actions", () => {
    render(
      <MemoryRouter>
        <PageHeader back={{ to: "/repertorio", label: "Repertório" }} title="Minueto em Sol" description="Bach" actions={<button type="button">Tocar</button>} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Repertório" })).toHaveAttribute("href", "/repertorio");
    expect(screen.getByRole("heading", { level: 1, name: "Minueto em Sol" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
  });
});

describe("ListRow", () => {
  it("turns the title into the row's link and keeps trailing actions reachable", () => {
    render(
      <MemoryRouter>
        <List label="Peças">
          <ListRow to="/repertorio/peca/1" title="Gavota" meta="Gossec" trailing={<button type="button">Tocar Gavota</button>} current />
          <ListRow title="Sem link" />
        </List>
      </MemoryRouter>,
    );
    const rows = screen.getByRole("list", { name: "Peças" }).querySelectorAll("li");
    expect(rows).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Gavota" })).toHaveAttribute("href", "/repertorio/peca/1");
    expect(rows[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Tocar Gavota" })).toBeInTheDocument();
    expect(rows[1]?.querySelector("a")).toBeNull();
  });
});

describe("Stats", () => {
  it("pairs each value with its label in a description list", () => {
    render(
      <Stats label="Resumo">
        <Stat value="7" label="dias seguidos" />
      </Stats>,
    );
    const list = screen.getByLabelText("Resumo");
    expect(list.tagName).toBe("DL");
    expect(list.querySelector("dt")).toHaveTextContent("dias seguidos");
    expect(list.querySelector("dd")).toHaveTextContent("7");
  });
});
