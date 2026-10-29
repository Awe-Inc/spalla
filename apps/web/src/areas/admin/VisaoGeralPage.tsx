import { Link } from "react-router";

import { api } from "@/api/client";
import type { AdminStats } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { LoadState, RequireAccount } from "@/account/ui";
import { ButtonLink, Card, PageHeader } from "@/design/components";

function Stat({ label, value, to }: { label: string; value: number; to?: string }) {
  const body = (
    <>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="text-title font-semibold text-ink tabular">{value.toLocaleString("pt-BR")}</dd>
    </>
  );
  return to ? (
    <Link to={to} className="grid rounded-md bg-surface-soft p-4 transition-colors duration-fast ease-spalla hover:bg-surface-sunken">
      {body}
    </Link>
  ) : (
    <div className="grid rounded-md bg-surface-soft p-4">{body}</div>
  );
}

function Overview() {
  const stats = useApiData((signal) => api.get<AdminStats>("/admin/stats", signal), []);
  return (
    <LoadState {...stats}>
      {(data) => {
        const maxRole = Math.max(1, ...data.byRole.map((role) => role.users));
        return (
          <div className="grid gap-6">
            {data.pendingTeachers > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-soft p-5">
                <p className="text-body text-ink">
                  {data.pendingTeachers === 1 ? "1 professor espera aprovação." : `${data.pendingTeachers} professores esperam aprovação.`}
                </p>
                <ButtonLink to="/admin/professores" variant="primary">
                  Analisar pedidos
                </ButtonLink>
              </div>
            ) : null}
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Contas" value={data.users} to="/admin/usuarios" />
              <Stat label="Ativas na semana" value={data.activeLast7Days} />
              <Stat label="Novas em 30 dias" value={data.newLast30Days} />
              <Stat label="Suspensas" value={data.suspended} to="/admin/usuarios?status=suspended" />
              <Stat label="Turmas" value={data.classes} />
              <Stat label="Tarefas" value={data.assignments} />
              <Stat label="Materiais" value={data.materials} />
              <Stat label="Minutos praticados na semana" value={data.practiceMinutesLast7Days} />
            </dl>
            <Card title="Contas por papel">
              <ul className="grid gap-3">
                {data.byRole.map((role) => (
                  <li key={role.key} className="grid gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-body">
                      <Link to={`/admin/usuarios?role=${encodeURIComponent(role.key)}`} className="font-medium text-ink hover:text-primary">
                        {role.name}
                      </Link>
                      <span className="tabular text-ink-muted">{role.users}</span>
                    </div>
                    <div className="h-2 rounded-pill bg-surface-soft">
                      <div className="h-2 rounded-pill bg-primary" style={{ width: `${(role.users / maxRole) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        );
      }}
    </LoadState>
  );
}

export function VisaoGeralPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Visão geral" />
      <RequireAccount permissions={["reports.read"]}>
        <Overview />
      </RequireAccount>
    </div>
  );
}
