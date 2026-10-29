import { Outlet } from "react-router";

import { RequireAccount, SubNav } from "@/account/ui";

const ITEMS = [
  { to: "/aulas", label: "Tarefas", end: true },
  { to: "/aulas/planos", label: "Planos de estudo" },
  { to: "/aulas/materiais", label: "Materiais" },
  { to: "/aulas/turmas", label: "Turmas e avisos" },
];

export function AulasLayout() {
  return (
    <RequireAccount permissions={["lessons.read"]}>
      <SubNav items={ITEMS} label="Minhas aulas" />
      <Outlet />
    </RequireAccount>
  );
}
