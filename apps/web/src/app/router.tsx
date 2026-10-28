import { createBrowserRouter } from "react-router";

import { ConfiguracoesPage } from "@/areas/configuracoes/ConfiguracoesPage";
import { FerramentasPage } from "@/areas/ferramentas/FerramentasPage";
import { LatenciaPage } from "@/areas/ferramentas/LatenciaPage";
import { HojePage } from "@/areas/hoje/HojePage";
import { MusicasPage } from "@/areas/musicas/MusicasPage";
import { PraticarPage } from "@/areas/praticar/PraticarPage";
import { ProgressoPage } from "@/areas/progresso/ProgressoPage";
import { TocarPage } from "@/areas/tocar/TocarPage";

import { Shell } from "./Shell";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Shell,
    children: [
      { index: true, Component: HojePage },
      { path: "praticar", Component: PraticarPage },
      { path: "musicas", Component: MusicasPage },
      { path: "ferramentas", Component: FerramentasPage },
      { path: "ferramentas/latencia", Component: LatenciaPage },
      { path: "progresso", Component: ProgressoPage },
      { path: "configuracoes", Component: ConfiguracoesPage },
      { path: "tocar/:exerciseId", Component: TocarPage },
    ],
  },
]);
