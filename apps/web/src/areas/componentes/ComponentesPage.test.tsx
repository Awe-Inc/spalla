import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { colorTokenNames, THEME_OPTIONS } from "@/design/tokenCatalog";

import { ComponentesPage } from "./ComponentesPage";

function renderTab(aba?: string) {
  return render(
    <MemoryRouter initialEntries={[aba ? `/componentes?aba=${aba}` : "/componentes"]}>
      <ComponentesPage />
    </MemoryRouter>,
  );
}

describe("ComponentesPage", () => {
  it("opens on the colour tab, with every colour token swatch and a preview per theme", () => {
    const { container } = renderTab();
    for (const name of colorTokenNames()) {
      expect(container.querySelector(`.bg-${name}`), name).not.toBeNull();
    }
    const previews = screen.getByRole("list", { name: "Prévia dos temas" }).querySelectorAll("li[data-theme]");
    expect(previews).toHaveLength(THEME_OPTIONS.length);
    expect(previews[3]?.getAttribute("data-accent")).toBe("sepia");
    expect(screen.getByRole("link", { name: "Cores e temas" })).toHaveAttribute("aria-current", "page");
  });

  it("links back to Você › Ajustes, where it is opened from", () => {
    renderTab();
    expect(screen.getByRole("link", { name: /Ajustes/ })).toHaveAttribute("href", "/voce/ajustes");
  });

  it("shows one part of the system per tab, chosen by the URL", () => {
    renderTab("acoes");
    expect(screen.getByRole("link", { name: "Ações e ícones" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cores e temas" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("list", { name: "Prévia dos temas" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Começar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Indisponível" })).toBeDisabled();
  });

  it("renders every base component across the tabs", () => {
    renderTab("progresso");
    expect(screen.getByRole("img", { name: "3 de 3" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 limpas de 5, uma falhou" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Precisão de exemplo" }).querySelectorAll("li")).toHaveLength(4);
    expect(screen.getAllByText("Sol")).not.toHaveLength(0);

    renderTab("avisos");
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("O microfone não respondeu.");
    expect(screen.getByText("Nenhuma música na estante")).toBeInTheDocument();

    renderTab("estrutura");
    expect(screen.getByRole("list", { name: "Peças de exemplo" }).querySelectorAll("li")).toHaveLength(3);

    renderTab("formulario");
    expect(screen.getByRole("radiogroup", { name: "Vista do Tocar" })).toBeInTheDocument();
  });
});
