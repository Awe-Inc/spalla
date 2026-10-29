import { Outlet } from "react-router";

import { TEACHER_PERMISSIONS } from "@/account/store";
import { RequireAccount, SubNav } from "@/account/ui";

const ITEMS = [
  { to: "/professor", label: "Turmas", end: true },
  { to: "/professor/tarefas", label: "Tarefas" },
  { to: "/professor/planos", label: "Planos de estudo" },
  { to: "/professor/materiais", label: "Materiais" },
  { to: "/professor/alunos", label: "Alunos" },
];

export function ProfessorLayout() {
  return (
    <RequireAccount permissions={TEACHER_PERMISSIONS}>
      <SubNav items={ITEMS} label="Área do professor" />
      <Outlet />
    </RequireAccount>
  );
}
