import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { api, queryString } from "@/api/client";
import type { AdminUser, Page, Role } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { formatDate, LoadState, RequireAccount } from "@/account/ui";
import { Badge, FIELD_CLASS, SelectField } from "@/design/fields";
import { Button, PageHeader } from "@/design/components";

import { APPLICATION_LABELS, PAGE_SIZE, pageLabel, STATUS_LABELS } from "./admin";

const SEARCH_DELAY_MS = 300;

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

function UserList() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const q = useDebounced(query.trim());
  const role = params.get("role") ?? "";
  const status = params.get("status") ?? "";
  const application = params.get("professor") ?? "";
  const offset = Math.max(0, Number(params.get("pagina") ?? 0) || 0) * PAGE_SIZE;
  const roles = useApiData((signal) => api.get<Role[]>("/admin/roles", signal), []);
  const users = useApiData(
    (signal) => api.get<Page<AdminUser>>(`/admin/users${queryString({ q: q || undefined, role: role || undefined, status: status || undefined, teacherApplication: application || undefined, limit: PAGE_SIZE, offset })}`, signal),
    [q, role, status, application, offset],
  );
  const roleNames = new Map((roles.data ?? []).map((item) => [item.key, item.name]));

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("pagina");
    setParams(next, { replace: true });
  }

  function goToPage(page: number) {
    const next = new URLSearchParams(params);
    next.set("pagina", String(page));
    setParams(next);
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-caption font-medium text-ink md:col-span-4 lg:col-span-1">
          Buscar
          <input type="search" name="busca" autoComplete="off" placeholder="Nome ou e-mail…" className={FIELD_CLASS} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <SelectField label="Papel" value={role} onChange={(event) => setFilter("role", event.target.value)}>
          <option value="">Todos</option>
          {(roles.data ?? []).map((item) => (
            <option key={item.key} value={item.key}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Situação" value={status} onChange={(event) => setFilter("status", event.target.value)}>
          <option value="">Todas</option>
          <option value="active">Ativas</option>
          <option value="suspended">Suspensas</option>
        </SelectField>
        <SelectField label="Pedido de professor" value={application} onChange={(event) => setFilter("professor", event.target.value)}>
          <option value="">Qualquer</option>
          <option value="pending">Em análise</option>
          <option value="approved">Aprovado</option>
          <option value="rejected">Recusado</option>
        </SelectField>
      </div>
      <LoadState {...users}>
        {(page) => (
          <div className="grid gap-4">
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[44rem] text-left text-body">
                <thead className="text-caption text-ink-muted">
                  <tr className="border-b border-hairline">
                    <th className="py-2 pr-4 font-medium">Nome</th>
                    <th className="py-2 pr-4 font-medium">Papéis</th>
                    <th className="py-2 pr-4 font-medium">Situação</th>
                    <th className="py-2 pr-4 font-medium">Criada</th>
                    <th className="py-2 font-medium">Último acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((user) => (
                    <tr key={user.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4">
                        <Link to={`/admin/usuarios/${user.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                          {user.name}
                        </Link>
                        <span className="block text-caption text-ink-muted">{user.email}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="flex flex-wrap gap-1">
                          {user.roles.map((key) => (
                            <Badge key={key}>{roleNames.get(key) ?? key}</Badge>
                          ))}
                          {user.teacherApplication === "pending" ? <Badge tone="warn">{APPLICATION_LABELS.pending}</Badge> : null}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={user.status === "active" ? "good" : "bad"}>{STATUS_LABELS[user.status]}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-ink-muted">{formatDate(user.createdAt)}</td>
                      <td className="py-3 text-ink-muted">{formatDate(user.lastLoginAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-caption text-ink-muted">{pageLabel(offset, page.items.length, page.total)}</span>
              <span className="flex gap-2">
                <Button variant="ghost" disabled={offset === 0} onClick={() => goToPage(offset / PAGE_SIZE - 1)}>
                  Anterior
                </Button>
                <Button variant="ghost" disabled={offset + page.items.length >= page.total} onClick={() => goToPage(offset / PAGE_SIZE + 1)}>
                  Próxima
                </Button>
              </span>
            </div>
          </div>
        )}
      </LoadState>
    </div>
  );
}

export function UsuariosPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Usuários" />
      <RequireAccount permissions={["users.read"]}>
        <UserList />
      </RequireAccount>
    </div>
  );
}
