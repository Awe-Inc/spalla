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
        { path: "musicas/estante", lazy: async () => ({ Component: (await import("@/areas/estante/EstantePage")).EstantePage }) },
        { path: "musicas/peca/musica/:pieceId", lazy: async () => ({ Component: (await import("@/areas/musicas/PecaPage")).PecaPage }) },
        { path: "musicas/peca/biblioteca/:librarySlug", lazy: async () => ({ Component: (await import("@/areas/musicas/PecaPage")).PecaPage }) },
        { path: "musicas/peca/:exerciseId", lazy: async () => ({ Component: (await import("@/areas/musicas/PecaPage")).PecaPage }) },
        { path: "musicas/suzuki", lazy: async () => ({ Component: (await import("@/areas/musicas/SuzukiPage")).SuzukiPage }) },
        { path: "estante/:sheetId", lazy: async () => ({ Component: (await import("@/areas/estante/LeitorPage")).LeitorPage }) },
        { path: "ferramentas", Component: FerramentasPage },
        { path: "ferramentas/latencia", Component: LatenciaPage },
        { path: "ferramentas/afinador", Component: AfinadorPage },
        { path: "ferramentas/metronomo", Component: MetronomoPage },
        { path: "ferramentas/pedal", Component: PedalPage },
        { path: "ferramentas/gravador", lazy: async () => ({ Component: (await import("@/areas/ferramentas/GravadorPage")).GravadorPage }) },
        { path: "progresso", Component: ProgressoPage },
        { path: "configuracoes", Component: ConfiguracoesPage },
        { path: "componentes", lazy: async () => ({ Component: (await import("@/areas/componentes/ComponentesPage")).ComponentesPage }) },
        { path: "tocar/musica/:pieceId", Component: TocarPage },
        { path: "tocar/biblioteca/:librarySlug", Component: TocarPage },
        { path: "tocar/:exerciseId", Component: TocarPage },
        { path: "boas-vindas", Component: BoasVindasPage },
        { path: "entrar", lazy: async () => ({ Component: (await import("@/areas/conta/EntrarPage")).EntrarPage }) },
        { path: "criar-conta", lazy: async () => ({ Component: (await import("@/areas/conta/CriarContaPage")).CriarContaPage }) },
        { path: "termos", lazy: async () => ({ Component: (await import("@/areas/conta/TermosPage")).TermosPage }) },
        { path: "conta", lazy: async () => ({ Component: (await import("@/areas/conta/ContaPage")).ContaPage }) },
        {
          path: "professor",
          lazy: async () => ({ Component: (await import("@/areas/professor/ProfessorLayout")).ProfessorLayout }),
          children: [
            { index: true, lazy: async () => ({ Component: (await import("@/areas/professor/TurmasPage")).TurmasPage }) },
            { path: "turmas/:classId", lazy: async () => ({ Component: (await import("@/areas/professor/TurmaPage")).TurmaPage }) },
            { path: "tarefas", lazy: async () => ({ Component: (await import("@/areas/professor/TarefasPage")).TarefasPage }) },
            { path: "tarefas/nova", lazy: async () => ({ Component: (await import("@/areas/professor/TarefaFormPage")).NovaTarefaPage }) },
            { path: "tarefas/:assignmentId", lazy: async () => ({ Component: (await import("@/areas/professor/TarefaPage")).TarefaPage }) },
            { path: "tarefas/:assignmentId/editar", lazy: async () => ({ Component: (await import("@/areas/professor/TarefaFormPage")).EditarTarefaPage }) },
            { path: "planos", lazy: async () => ({ Component: (await import("@/areas/professor/PlanosPage")).PlanosPage }) },
            { path: "planos/novo", lazy: async () => ({ Component: (await import("@/areas/professor/PlanosPage")).NovoPlanoPage }) },
            { path: "planos/:planId/editar", lazy: async () => ({ Component: (await import("@/areas/professor/PlanosPage")).EditarPlanoPage }) },
            { path: "materiais", lazy: async () => ({ Component: (await import("@/areas/professor/MateriaisPage")).MateriaisPage }) },
            { path: "alunos", lazy: async () => ({ Component: (await import("@/areas/professor/AlunosPage")).AlunosPage }) },
            { path: "alunos/:studentId", lazy: async () => ({ Component: (await import("@/areas/professor/AlunosPage")).AlunoPage }) },
          ],
        },
      ],
    },
  ],
  { basename },
);
