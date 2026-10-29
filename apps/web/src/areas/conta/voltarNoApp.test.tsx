import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CriarContaPage } from "./CriarContaPage";
import { EntrarPage } from "./EntrarPage";
import { TermosPage } from "./TermosPage";

const platform = vi.hoisted(() => ({ enabled: true }));

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  isPlatformEnabled: () => platform.enabled,
}));

function renderAt(path: string, Page: ComponentType) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Page />
    </MemoryRouter>,
  );
}

const ACCOUNT_PAGES: readonly (readonly [string, ComponentType])[] = [
  ["/entrar", EntrarPage],
  ["/criar-conta", CriarContaPage],
];

describe("account pages lead back inside the app", () => {
  beforeEach(() => {
    platform.enabled = true;
  });

  it.each(ACCOUNT_PAGES)("%s links back to Você › Conta", (path, Page) => {
    renderAt(path, Page);
    expect(screen.getByRole("link", { name: /Conta$/ })).toHaveAttribute("href", "/voce/conta");
  });

  it.each(ACCOUNT_PAGES)("%s still links back when the platform is off", (path, Page) => {
    platform.enabled = false;
    renderAt(path, Page);
    expect(screen.getByRole("link", { name: "Voltar para Conta" })).toHaveAttribute("href", "/voce/conta");
  });

  it("the terms page links back to account creation", () => {
    renderAt("/termos", TermosPage);
    expect(screen.getByRole("link", { name: /Criar conta/ })).toHaveAttribute("href", "/criar-conta");
  });
});
