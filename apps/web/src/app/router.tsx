import { createBrowserRouter, Navigate, useLocation, type RouteObject } from "react-router";

import { BoasVindasPage } from "@/areas/boas-vindas/BoasVindasPage";
import { ConfiguracoesPage } from "@/areas/configuracoes/ConfiguracoesPage";
import { AfinadorPage } from "@/areas/ferramentas/AfinadorPage";
import { FerramentasPage } from "@/areas/ferramentas/FerramentasPage";
import { LatenciaPage } from "@/areas/ferramentas/LatenciaPage";
import { MetronomoPage } from "@/areas/ferramentas/MetronomoPage";
import { PedalPage } from "@/areas/ferramentas/PedalPage";
import { HojePage } from "@/areas/hoje/HojePage";
import { MusicasPage } from "@/areas/musicas/MusicasPage";
import { RotinaPage } from "@/areas/estudar/RotinaPage";
import { ProgressoPage } from "@/areas/progresso/ProgressoPage";
import { ErroDeRotaPage, NaoEncontradaPage } from "@/areas/sistema/SistemaPages";
import { TocarPage } from "@/areas/tocar/TocarPage";

import { LEGACY_REDIRECTS, legacyTarget } from "./legacyRoutes";
import { Shell, type RouteHandle } from "./Shell";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

const FULLSCREEN: RouteHandle = { fullscreen: true };

function LegacyRedirect() {
  const location = useLocation();
  return <Navigate to={`${legacyTarget(location.pathname) ?? "/"}${location.search}`} replace />;
}

const legacyRoutes: RouteObject[] = LEGACY_REDIRECTS.flatMap(([from]) => [
  { path: from.slice(1), Component: LegacyRedirect },
  { path: `${from.slice(1)}/*`, Component: LegacyRedirect },
]);

const peca = async () => ({ Component: (await import("@/areas/musicas/PecaPage")).PecaPage });

export const router = createBrowserRouter(
  [
    {
      path: "/",
      Component: Shell,
      errorElement: <ErroDeRotaPage />,
      children: [
        { index: true, Component: HojePage },
        { path: "estudar", Component: RotinaPage },
        { path: "estudar/metodo", lazy: async () => ({ Component: (await import("@/areas/estudar/MetodoPage")).MetodoPage }) },
        { path: "estudar/caderno", lazy: async () => ({ Component: (await import("@/areas/estudar/CadernoPage")).CadernoPage }) },
        { path: "estudar/modulo/:moduleId", lazy: async () => ({ Component: (await import("@/areas/estudar/ModuloPage")).ModuloPage }) },
        { path: "repertorio", Component: MusicasPage },
        { path: "repertorio/estante", lazy: async () => ({ Component: (await import("@/areas/estante/EstantePage")).EstantePage }) },
        { path: "repertorio/estante/:sheetId", handle: FULLSCREEN, lazy: async () => ({ Component: (await import("@/areas/estante/LeitorPage")).LeitorPage }) },
        { path: "repertorio/suzuki", lazy: async () => ({ Component: (await import("@/areas/musicas/SuzukiPage")).SuzukiPage }) },
        { path: "repertorio/peca/musica/:pieceId", lazy: peca },
        { path: "repertorio/peca/biblioteca/:librarySlug", lazy: peca },
        { path: "repertorio/peca/:exerciseId", lazy: peca },
        { path: "ferramentas", Component: FerramentasPage },
        { path: "ferramentas/afinador", Component: AfinadorPage },
        { path: "ferramentas/metronomo", Component: MetronomoPage },
        { path: "ferramentas/pedal", Component: PedalPage },
        { path: "ferramentas/gravador", lazy: async () => ({ Component: (await import("@/areas/ferramentas/GravadorPage")).GravadorPage }) },
        { path: "voce", Component: ProgressoPage },
        { path: "voce/ajustes", Component: ConfiguracoesPage },
        { path: "voce/ajustes/atraso", Component: LatenciaPage },
        { path: "voce/conta", lazy: async () => ({ Component: (await import("@/areas/conta/ContaPage")).ContaPage }) },
        ...legacyRoutes,
        { path: "componentes", lazy: async () => ({ Component: (await import("@/areas/componentes/ComponentesPage")).ComponentesPage }) },
        { path: "tocar/musica/:pieceId", handle: FULLSCREEN, Component: TocarPage },
        { path: "tocar/biblioteca/:librarySlug", handle: FULLSCREEN, Component: TocarPage },
        { path: "tocar/:exerciseId", handle: FULLSCREEN, Component: TocarPage },
        { path: "boas-vindas", handle: FULLSCREEN, Component: BoasVindasPage },
        { path: "entrar", lazy: async () => ({ Component: (await import("@/areas/conta/EntrarPage")).EntrarPage }) },
        { path: "criar-conta", lazy: async () => ({ Component: (await import("@/areas/conta/CriarContaPage")).CriarContaPage }) },
        { path: "termos", lazy: async () => ({ Component: (await import("@/areas/conta/TermosPage")).TermosPage }) },
        {
          path: "aulas",
          lazy: async () => ({ Component: (await import("@/areas/aulas/AulasLayout")).AulasLayout }),
          children: [
            { index: true, lazy: async () => ({ Component: (await import("@/areas/aulas/TarefasAlunoPage")).TarefasAlunoPage }) },
            { path: "planos", lazy: async () => ({ Component: (await import("@/areas/aulas/PlanosAlunoPage")).PlanosAlunoPage }) },
            { path: "materiais", lazy: async () => ({ Component: (await import("@/areas/aulas/MateriaisAlunoPage")).MateriaisAlunoPage }) },
            { path: "turmas", lazy: async () => ({ Component: (await import("@/areas/aulas/TurmasAlunoPage")).TurmasAlunoPage }) },
          ],
        },
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
        {
          path: "admin",
          lazy: async () => ({ Component: (await import("@/areas/admin/AdminLayout")).AdminLayout }),
          children: [
            { index: true, lazy: async () => ({ Component: (await import("@/areas/admin/VisaoGeralPage")).VisaoGeralPage }) },
            { path: "usuarios", lazy: async () => ({ Component: (await import("@/areas/admin/UsuariosPage")).UsuariosPage }) },
            { path: "usuarios/:userId", lazy: async () => ({ Component: (await import("@/areas/admin/UsuarioPage")).UsuarioPage }) },
            { path: "professores", lazy: async () => ({ Component: (await import("@/areas/admin/ProfessoresPage")).ProfessoresPage }) },
            { path: "papeis", lazy: async () => ({ Component: (await import("@/areas/admin/PapeisPage")).PapeisPage }) },
            { path: "convites", lazy: async () => ({ Component: (await import("@/areas/admin/ConvitesPage")).ConvitesPage }) },
            { path: "auditoria", lazy: async () => ({ Component: (await import("@/areas/admin/AuditoriaPage")).AuditoriaPage }) },
            { path: "configuracoes", lazy: async () => ({ Component: (await import("@/areas/admin/AdminConfigPage")).AdminConfigPage }) },
          ],
        },
      ],
    },
    { path: "*", Component: NaoEncontradaPage },
  ],
  { basename },
);
