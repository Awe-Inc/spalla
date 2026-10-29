import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import type { Permission, PermissionInfo, Role } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { FormError, LoadState, Notice, RequireAccount } from "@/account/ui";
import { Badge, TextField } from "@/design/fields";
import { Button, Card, PageHeader } from "@/design/components";

import { PERMISSION_GROUPS, togglePermission } from "./admin";

const ADMIN_ROLE_KEY = "admin";

interface RoleDraft {
  name: string;
  description: string;
  permissions: Permission[];
}

function PermissionChecklist({ labels, value, onChange, disabled }: { labels: Map<Permission, string>; value: readonly Permission[]; onChange: (next: Permission[]) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PERMISSION_GROUPS.map((group) => (
        <fieldset key={group.label} className="grid content-start gap-2">
          <legend className="mb-1 text-caption font-medium text-ink-muted">{group.label}</legend>
          {group.permissions.map((permission) => (
            <label key={permission} className="flex items-start gap-2 text-body text-ink">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                disabled={disabled}
                checked={value.includes(permission)}
                onChange={(event) => onChange(togglePermission(value, permission, event.target.checked))}
              />
              {labels.get(permission) ?? permission}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function RoleForm({ initial, labels, locked, submitLabel, onSubmit, onCancel }: { initial: RoleDraft; labels: Map<Permission, string>; locked?: boolean; submitLabel: string; onSubmit: (draft: RoleDraft) => Promise<void>; onCancel?: () => void }) {
  const [draft, setDraft] = useState<RoleDraft>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSubmit({ ...draft, name: draft.name.trim(), description: draft.description.trim() });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Nome" required maxLength={60} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <TextField label="Descrição" maxLength={300} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      </div>
      <PermissionChecklist labels={labels} value={draft.permissions} disabled={locked} onChange={(permissions) => setDraft({ ...draft, permissions })} />
      {locked ? <p className="text-caption text-ink-muted">As permissões do papel de administrador não mudam, para ninguém perder o acesso ao sistema.</p> : null}
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending || draft.name.trim().length < 2}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function RoleRow({ role, labels, onChanged }: { role: Role; labels: Map<Permission, string>; onChanged: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    try {
      await api.delete(`/admin/roles/${role.id}`);
      onChanged(`Papel ${role.name} apagado.`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <li className="grid gap-3 border-b border-hairline py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{role.name}</span>
            {role.builtIn ? <Badge tone="info">Do sistema</Badge> : null}
            <Link to={`/admin/usuarios?role=${encodeURIComponent(role.key)}`} className="text-caption text-primary underline-offset-4 hover:underline">
              {role.users === 1 ? "1 pessoa" : `${role.users} pessoas`}
            </Link>
          </span>
          {role.description ? <span className="text-caption text-ink-muted">{role.description}</span> : null}
        </div>
        {editing ? null : (
          <span className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Editar
            </Button>
            {role.builtIn ? null : confirming ? (
              <>
                <Button variant="ghost" className="text-off" onClick={() => void remove()}>
                  Apagar
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Manter
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                Apagar
              </Button>
            )}
          </span>
        )}
      </div>
      {editing ? (
        <RoleForm
          initial={{ name: role.name, description: role.description, permissions: role.permissions }}
          labels={labels}
          locked={role.key === ADMIN_ROLE_KEY}
          submitLabel="Salvar papel"
          onCancel={() => setEditing(false)}
          onSubmit={async (draft) => {
            await api.patch(`/admin/roles/${role.id}`, role.key === ADMIN_ROLE_KEY ? { name: draft.name, description: draft.description } : draft);
            setEditing(false);
            onChanged(`Papel ${draft.name} salvo.`);
          }}
        />
      ) : (
        <span className="flex flex-wrap gap-1">
          {role.permissions.map((permission) => (
            <Badge key={permission}>{labels.get(permission) ?? permission}</Badge>
          ))}
        </span>
      )}
      <FormError message={error} />
    </li>
  );
}

function Roles() {
  const roles = useApiData((signal) => api.get<Role[]>("/admin/roles", signal), []);
  const permissions = useApiData((signal) => api.get<PermissionInfo[]>("/admin/permissions", signal), []);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const labels = new Map((permissions.data ?? []).map((item) => [item.key, item.label]));

  function changed(text: string) {
    setMessage(text);
    roles.reload();
  }

  return (
    <div className="grid gap-6">
      {message ? <Notice>{message}</Notice> : null}
      <Card title="Novo papel">
        {creating ? (
          <RoleForm
            initial={{ name: "", description: "", permissions: [] }}
            labels={labels}
            submitLabel="Criar papel"
            onCancel={() => setCreating(false)}
            onSubmit={async (draft) => {
              await api.post("/admin/roles", draft);
              setCreating(false);
              changed(`Papel ${draft.name} criado.`);
            }}
          />
        ) : (
          <div className="grid gap-3">
            <p className="text-body text-ink-muted">Um papel junta permissões. Por exemplo, um monitor que acompanha o progresso dos alunos mas não cria turmas.</p>
            <div>
              <Button variant="primary" onClick={() => setCreating(true)}>
                Criar papel
              </Button>
            </div>
          </div>
        )}
      </Card>
      <Card title="Papéis">
        <LoadState {...roles}>
          {(list) => (
            <ul>
              {list.map((role) => (
                <RoleRow key={`${role.id}-${role.permissions.join(",")}-${role.name}`} role={role} labels={labels} onChanged={changed} />
              ))}
            </ul>
          )}
        </LoadState>
      </Card>
    </div>
  );
}

export function PapeisPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Papéis e permissões" />
      <RequireAccount permissions={["roles.manage"]}>
        <Roles />
      </RequireAccount>
    </div>
  );
}
