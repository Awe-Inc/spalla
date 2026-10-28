import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { colorTokenNames, THEME_OPTIONS } from "@/design/tokenCatalog";

import { ComponentesPage } from "./ComponentesPage";

describe("ComponentesPage", () => {
  it("shows every colour token with its swatch class and a preview per theme", () => {
    const { container } = render(<ComponentesPage />);
    for (const name of colorTokenNames()) {
      expect(container.querySelector(`.bg-${name}`), name).not.toBeNull();
    }
    const previews = screen.getByRole("list", { name: "Prévia dos temas" }).querySelectorAll("li[data-theme]");
    expect(previews).toHaveLength(THEME_OPTIONS.length);
    expect(previews[3]?.getAttribute("data-accent")).toBe("sepia");
  });

  it("renders every base component at least once", () => {
    render(<ComponentesPage />);
    expect(screen.getByRole("button", { name: "Começar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Indisponível" })).toBeDisabled();
    expect(screen.getByRole("img", { name: "3 de 3" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 limpas de 5, uma falhou" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Precisão de exemplo" }).querySelectorAll("li")).toHaveLength(4);
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("O microfone não respondeu.");
    expect(screen.getByText("Nenhuma música na estante")).toBeInTheDocument();
    expect(screen.getAllByText("Sol")).not.toHaveLength(0);
  });
});
