import { createBrowserRouter, Navigate, useLocation, type RouteObject } from "react-router";

import { HojePage } from "@/areas/hoje/HojePage";
import { ErroDeRotaPage, NaoEncontradaPage } from "@/areas/sistema/SistemaPages";

import { devOnlyRoutes } from "./devRoutes";
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

const tocar = async () => ({ Component: (await import("@/areas/tocar/TocarPage")).TocarPage });
const peca = async () => ({ Component: (await import("@/areas/musicas/PecaPage")).PecaPage });

export const router = createBrowserRouter(
  [
    {
      path: "/",
      Component: Shell,
      errorElement: <ErroDeRotaPage />,
      hydrateFallbackElement: <div className="min-h-dvh bg-canvas" />,
      children: [
        { index: true, Component: HojePage },
        { path: "estudar", lazy: async () => ({ Component: (await import("@/areas/estudar/RotinaPage")).RotinaPage }) },
        { path: "estudar/metodo", lazy: async () => ({ Component: (await import("@/areas/estudar/MetodoPage")).MetodoPage }) },
        { path: "estudar/caderno", lazy: async () => ({ Component: (await import("@/areas/estudar/CadernoPage")).CadernoPage }) },
        { path: "estudar/modulo/:moduleId", lazy: async () => ({ Component: (await import("@/areas/estudar/ModuloPage")).ModuloPage }) },
        { path: "repertorio", lazy: async () => ({ Component: (await import("@/areas/musicas/MusicasPage")).MusicasPage }) },
        { path: "repertorio/estante", lazy: async () => ({ Component: (await import("@/areas/estante/EstantePage")).EstantePage }) },
        { path: "repertorio/estante/:sheetId", handle: FULLSCREEN, lazy: async () => ({ Component: (await import("@/areas/estante/LeitorPage")).LeitorPage }) },
        { path: "repertorio/suzuki", lazy: async () => ({ Component: (await import("@/areas/musicas/SuzukiPage")).SuzukiPage }) },
        { path: "repertorio/peca/musica/:pieceId", lazy: peca },
        { path: "repertorio/peca/biblioteca/:librarySlug", lazy: peca },
        { path: "repertorio/peca/:exerciseId", lazy: peca },
        { path: "ferramentas", lazy: async () => ({ Component: (await import("@/areas/ferramentas/FerramentasPage")).FerramentasPage }) },
        { path: "ferramentas/afinador", lazy: async () => ({ Component: (await import("@/areas/ferramentas/AfinadorPage")).AfinadorPage }) },
        { path: "ferramentas/metronomo", lazy: async () => ({ Component: (await import("@/areas/ferramentas/MetronomoPage")).MetronomoPage }) },
        { path: "ferramentas/pedal", lazy: async () => ({ Component: (await import("@/areas/ferramentas/PedalPage")).PedalPage }) },
        { path: "ferramentas/gravador", lazy: async () => ({ Component: (await import("@/areas/ferramentas/GravadorPage")).GravadorPage }) },
        { path: "voce", lazy: async () => ({ Component: (await import("@/areas/progresso/ProgressoPage")).ProgressoPage }) },
        { path: "voce/ajustes", lazy: async () => ({ Component: (await import("@/areas/configuracoes/ConfiguracoesPage")).ConfiguracoesPage }) },
        { path: "voce/ajustes/atraso", lazy: async () => ({ Component: (await import("@/areas/ferramentas/LatenciaPage")).LatenciaPage }) },
        { path: "voce/conta", lazy: async () => ({ Component: (await import("@/areas/conta/ContaPage")).ContaPage }) },
        ...legacyRoutes,
        ...devOnlyRoutes(import.meta.env.DEV),
        { path: "tocar/musica/:pieceId", handle: FULLSCREEN, lazy: tocar },
        { path: "tocar/biblioteca/:librarySlug", handle: FULLSCREEN, lazy: tocar },
        { path: "tocar/:exerciseId", handle: FULLSCREEN, lazy: tocar },
        { path: "boas-vindas", handle: FULLSCREEN, lazy: async () => ({ Component: (await import("@/areas/boas-vindas/BoasVindasPage")).BoasVindasPage }) },
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
