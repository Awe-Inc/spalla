import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAccount } from "@/account/store";
import { NaoEncontradaPage } from "@/areas/sistema/SistemaPages";

import { Shell } from "./Shell";
import { useSettings } from "./settings";

const platform = vi.hoisted(() => ({ enabled: false }));

vi.mock("dexie-react-hooks", () => ({ useLiveQuery: () => undefined }));
vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  isPlatformEnabled: () => platform.enabled,
}));
vi.mock("@/account/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/store")>()),
  refreshMe: () => Promise.resolve(),
}));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        Component: Shell,
        children: [
          { index: true, element: <p>conteúdo</p> },
          { path: "voce/ajustes", element: <p>ajustes</p> },
          { path: "tocar", handle: { fullscreen: true }, element: <p>tela cheia</p> },
        ],
      },
      { path: "*", Component: NaoEncontradaPage },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  platform.enabled = false;
  useAccount.setState({ user: null, token: null });
  useSettings.setState({ onboardedAt: 1 });
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe("Shell", () => {
  it("keeps the five areas and Ajustes in the sidebar", () => {
    renderAt("/");
    const sidebar = screen.getByRole("complementary");
    const areas = within(sidebar).getByRole("navigation", { name: "Áreas" });
    expect(within(areas).getAllByRole("link").map((link) => link.textContent)).toEqual(["Hoje", "Estudar", "Repertório", "Ferramentas", "Você"]);
    expect(within(sidebar).getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/voce/ajustes");
    expect(within(sidebar).queryByRole("link", { name: "Entrar" })).not.toBeInTheDocument();
  });

  it("shows Entrar in the sidebar footer, outside the scrolling list, when the platform is on and nobody is signed in", () => {
    platform.enabled = true;
    renderAt("/");
    const sidebar = screen.getByRole("complementary");
    const entrar = within(sidebar).getByRole("link", { name: "Entrar" });
    expect(entrar).toHaveAttribute("href", "/entrar");
    expect(entrar.closest(".overflow-y-auto")).toBeNull();
    expect(within(sidebar).getByRole("link", { name: "Ajustes" }).closest(".overflow-y-auto")).toBeNull();
  });

  it("drops the chrome on fullscreen routes", () => {
    renderAt("/tocar");
    expect(screen.getByText("tela cheia")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});

describe("NaoEncontradaPage", () => {
  it("says the page does not exist and offers a way back", () => {
    renderAt("/nao-existe");
    expect(screen.getByText("Esta página não existe.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para Hoje" })).toHaveAttribute("href", "/");
  });
});
