import { Link, useSearchParams } from "react-router";

import { api, queryString } from "@/api/client";
import type { AuditEntry, Page } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { formatDateTime, LoadState, RequireAccount, SelectField } from "@/account/ui";
import { Button, EmptyState, PageTitle } from "@/design/components";

import { actionLabel, AUDIT_ACTION_GROUPS, PAGE_SIZE, pageLabel } from "./admin";

function Entry({ entry }: { entry: AuditEntry }) {
  return (
    <li className="grid gap-1 border-b border-hairline py-3 last:border-0 md:grid-cols-[12rem_1fr]">
      <time dateTime={entry.at} className="text-caption text-ink-muted tabular">
        {formatDateTime(entry.at)}
      </time>
      <div className="grid gap-0.5">
        <span className="font-medium text-ink">{actionLabel(entry.action)}</span>
        <span className="text-caption text-ink-muted">
          {entry.actorId ? (
            <Link to={`/admin/usuarios/${entry.actorId}`} className="text-primary underline-offset-4 hover:underline">
              {entry.actorName ?? entry.actorEmail}
            </Link>
          ) : (
            "Sem conta"
          )}
          {entry.targetType === "user" && entry.targetId && entry.targetId !== entry.actorId ? (
            <>
              {" sobre "}
              <Link to={`/admin/usuarios/${entry.targetId}`} className="text-primary underline-offset-4 hover:underline">
                outra conta
              </Link>
            </>
          ) : null}
          {entry.ip ? `. IP ${entry.ip}` : ""}
        </span>
      </div>
    </li>
  );
}

function AuditList() {
  const [params, setParams] = useSearchParams();
  const action = params.get("acao") ?? "";
  const offset = Math.max(0, Number(params.get("pagina") ?? 0) || 0) * PAGE_SIZE;
  const entries = useApiData(
    (signal) => api.get<Page<AuditEntry>>(`/admin/audit${queryString({ action: action || undefined, limit: PAGE_SIZE, offset })}`, signal),
    [action, offset],
  );

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "pagina") next.delete("pagina");
    setParams(next);
  }

  return (
    <div className="grid gap-4">
      <div className="max-w-xs">
        <SelectField label="Assunto" value={action} onChange={(event) => update("acao", event.target.value)}>
          <option value="">Tudo</option>
          {AUDIT_ACTION_GROUPS.map((group) => (
            <option key={group.prefix} value={group.prefix}>
              {group.label}
            </option>
          ))}
        </SelectField>
      </div>
      <LoadState {...entries}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState title="Nada registrado" description="Nenhuma ação com esse filtro ainda." />
          ) : (
            <div className="grid gap-4">
              <ul>
                {page.items.map((entry) => (
                  <Entry key={entry.id} entry={entry} />
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-caption text-ink-muted">{pageLabel(offset, page.items.length, page.total)}</span>
                <span className="flex gap-2">
                  <Button variant="ghost" disabled={offset === 0} onClick={() => update("pagina", String(offset / PAGE_SIZE - 1))}>
                    Anterior
                  </Button>
                  <Button variant="ghost" disabled={offset + page.items.length >= page.total} onClick={() => update("pagina", String(offset / PAGE_SIZE + 1))}>
                    Próxima
                  </Button>
                </span>
              </div>
            </div>
          )
        }
      </LoadState>
    </div>
  );
}

export function AuditoriaPage() {
  return (
    <div className="grid gap-6">
      <PageTitle title="Auditoria" eyebrow="Administração">
        <p className="max-w-prose text-body text-ink-muted">Cada ação que muda contas, papéis, turmas ou configurações fica registrada com quem fez e quando.</p>
      </PageTitle>
      <RequireAccount permissions={["audit.read"]}>
        <AuditList />
      </RequireAccount>
    </div>
  );
}
