import { Outlet } from "react-router";

import { ADMIN_PERMISSIONS, can, useAccount } from "@/account/store";
import { RequireAccount, SubNav } from "@/account/ui";
import type { Permission } from "@/api/types";

const ITEMS: readonly { to: string; label: string; end?: boolean; permission: Permission }[] = [
  { to: "/admin", label: "Visão geral", end: true, permission: "reports.read" },
  { to: "/admin/usuarios", label: "Usuários", permission: "users.read" },
  { to: "/admin/professores", label: "Professores", permission: "teachers.approve" },
  { to: "/admin/papeis", label: "Papéis e permissões", permission: "roles.manage" },
  { to: "/admin/convites", label: "Convites", permission: "invites.manage" },
  { to: "/admin/auditoria", label: "Auditoria", permission: "audit.read" },
  { to: "/admin/configuracoes", label: "Configurações", permission: "settings.manage" },
];

export function AdminLayout() {
  const user = useAccount((state) => state.user);
  const items = ITEMS.filter((item) => can(user, item.permission));
  return (
    <RequireAccount permissions={ADMIN_PERMISSIONS}>
      <SubNav items={items} label="Administração" />
      <Outlet />
    </RequireAccount>
  );
}
