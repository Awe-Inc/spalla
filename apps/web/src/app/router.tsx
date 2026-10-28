import { createBrowserRouter } from "react-router";

import { BoasVindasPage } from "@/areas/boas-vindas/BoasVindasPage";
import { ConfiguracoesPage } from "@/areas/configuracoes/ConfiguracoesPage";
import { AfinadorPage } from "@/areas/ferramentas/AfinadorPage";
import { FerramentasPage } from "@/areas/ferramentas/FerramentasPage";
import { LatenciaPage } from "@/areas/ferramentas/LatenciaPage";
import { MetronomoPage } from "@/areas/ferramentas/MetronomoPage";
import { PedalPage } from "@/areas/ferramentas/PedalPage";
import { HojePage } from "@/areas/hoje/HojePage";
import { MusicasPage } from "@/areas/musicas/MusicasPage";
import { PraticarPage } from "@/areas/praticar/PraticarPage";
import { ProgressoPage } from "@/areas/progresso/ProgressoPage";
import { TocarPage } from "@/areas/tocar/TocarPage";

import { Shell } from "./Shell";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

export const router = createBrowserRouter(
  [
    {
      path: "/",
      Component: Shell,
      children: [
        { index: true, Component: HojePage },
        { path: "praticar", Component: PraticarPage },
        { path: "musicas", Component: MusicasPage },
        { path: "ferramentas", Component: FerramentasPage },
        { path: "ferramentas/latencia", Component: LatenciaPage },
        { path: "ferramentas/afinador", Component: AfinadorPage },
        { path: "ferramentas/metronomo", Component: MetronomoPage },
        { path: "ferramentas/pedal", Component: PedalPage },
        { path: "progresso", Component: ProgressoPage },
        { path: "configuracoes", Component: ConfiguracoesPage },
        { path: "tocar/musica/:pieceId", Component: TocarPage },
        { path: "tocar/:exerciseId", Component: TocarPage },
        { path: "boas-vindas", Component: BoasVindasPage },
      ],
    },
  ],
  { basename },
);
