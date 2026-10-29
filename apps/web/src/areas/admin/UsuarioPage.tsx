import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { can, useAccount } from "@/account/store";
import { api, errorMessage } from "@/api/client";
import type { AdminUserDetail, Role } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { formatDate, formatDateTime, FormError, LoadState, Notice, RequireAccount } from "@/account/ui";
import { Badge, TextField } from "@/design/fields";
import { Button, Card, PageHeader } from "@/design/components";

import { APPLICATION_LABELS, STATUS_LABELS } from "./admin";

interface SectionProps {
  user: AdminUserDetail;
  onChanged: () => void;
}

function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<string | null>) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return { pending, error, message, run };
}

function ProfileForm({ user, onChanged }: SectionProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const action = useAction();
  const changed = name.trim() !== user.name || email.trim().toLowerCase() !== user.email;

  function submit(event: FormEvent) {
    event.preventDefault();
    void action.run(async () => {
      await api.patch(`/admin/users/${user.id}`, { name: name.trim(), email: email.trim() });
      onChanged();
      return "Dados salvos.";
    });
  }

  return (
    <Card title="Dados da conta">
      <form onSubmit={submit} className="grid gap-4">
        <TextField label="Nome" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
        <TextField label="E-mail" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
        <FormError message={action.error} />
        {action.message ? <Notice>{action.message}</Notice> : null}
        <div>
          <Button type="submit" variant="primary" disabled={action.pending || !changed || name.trim().length === 0}>
            Salvar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function RolesForm({ user, onChanged }: SectionProps) {
  const roles = useApiData((signal) => api.get<Role[]>("/admin/roles", signal), []);
  const [selected, setSelected] = useState<string[]>(user.roles);
  const action = useAction();
  const changed = selected.length !== user.roles.length || selected.some((key) => !user.roles.includes(key));

  function toggle(key: string, on: boolean) {
    setSelected((current) => (on ? [...current.filter((item) => item !== key), key] : current.filter((item) => item !== key)));
  }

  function save() {
    void action.run(async () => {
      await api.put(`/admin/users/${user.id}/roles`, { roles: selected });
      onChanged();
      return "Papéis atualizados. A pessoa vê as mudanças na próxima vez que abrir o app.";
    });
  }

  return (
    <Card title="Papéis">
      <LoadState {...roles}>
        {(list) => (
          <div className="grid gap-4">
            <ul className="grid gap-2">
              {list.map((role) => (
                <li key={role.id}>
                  <label className="flex items-start gap-3 rounded-md bg-surface-soft px-4 py-3">
                    <input type="checkbox" className="mt-1 size-4 accent-primary" checked={selected.includes(role.key)} onChange={(event) => toggle(role.key, event.target.checked)} />
                    <span className="grid gap-0.5">
                      <span className="font-medium text-ink">{role.name}</span>
                      {role.description ? <span className="text-caption text-ink-muted">{role.description}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <FormError message={action.error} />
            {action.message ? <Notice>{action.message}</Notice> : null}
            <div>
              <Button variant="primary" disabled={action.pending || !changed || selected.length === 0} onClick={save}>
                Salvar papéis
              </Button>
            </div>
          </div>
        )}
      </LoadState>
    </Card>
  );
}

function AccessCard({ user, onChanged }: SectionProps) {
  const me = useAccount((state) => state.user);
  const isSelf = me?.id === user.id;
  const action = useAction();
  const [resetCode, setResetCode] = useState<{ code: string; expiresInHours: number } | null>(null);

  function setStatus(status: "active" | "suspended") {
    void action.run(async () => {
      await api.patch(`/admin/users/${user.id}`, { status });
      onChanged();
      return status === "suspended" ? "Conta suspensa. As sessões abertas foram encerradas." : "Conta reativada.";
    });
  }

  function revokeSessions() {
    void action.run(async () => {
      const result = await api.post<{ revoked: number }>(`/admin/users/${user.id}/revoke-sessions`);
      onChanged();
      return result.revoked === 1 ? "1 sessão encerrada." : `${result.revoked} sessões encerradas.`;
    });
  }

  function createResetCode() {
    void action.run(async () => {
      setResetCode(await api.post<{ code: string; expiresInHours: number }>(`/admin/users/${user.id}/reset-code`));
      return null;
    });
  }

  return (
    <Card title="Acesso">
      <div className="grid gap-4">
        <p className="text-body text-ink-muted">
          {user.activeSessions === 1 ? "1 sessão aberta." : `${user.activeSessions} sessões abertas.`} Último acesso: {formatDateTime(user.lastLoginAt)}.
        </p>
        <div className="flex flex-wrap gap-2">
          {user.status === "active" ? (
            <Button variant="ghost" disabled={action.pending || isSelf} onClick={() => setStatus("suspended")}>
              Suspender conta
            </Button>
          ) : (
            <Button variant="primary" disabled={action.pending} onClick={() => setStatus("active")}>
              Reativar conta
            </Button>
          )}
          <Button variant="ghost" disabled={action.pending || user.activeSessions === 0} onClick={revokeSessions}>
            Encerrar sessões
          </Button>
          <Button variant="ghost" disabled={action.pending} onClick={createResetCode}>
            Gerar código de nova senha
          </Button>
        </div>
        {isSelf ? <p className="text-caption text-ink-muted">Você não pode suspender a própria conta.</p> : null}
        {resetCode ? (
          <div className="grid gap-2 rounded-md bg-primary-soft p-4">
            <p className="text-body text-ink">Passe este código à pessoa. Ele vale por {resetCode.expiresInHours} horas e só aparece agora.</p>
            <p className="font-mono text-title tracking-[0.15em] text-ink select-all">{resetCode.code}</p>
            <p className="text-caption text-ink-muted">Ela usa em Entrar, na opção Esqueci a senha.</p>
          </div>
        ) : null}
        <FormError message={action.error} />
        {action.message ? <Notice>{action.message}</Notice> : null}
      </div>
    </Card>
  );
}

function DeleteCard({ user }: { user: AdminUserDetail }) {
  const me = useAccount((state) => state.user);
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const action = useAction();

  if (me?.id === user.id) return null;

  function remove() {
    void action.run(async () => {
      await api.delete(`/admin/users/${user.id}`);
      void navigate("/admin/usuarios", { replace: true });
      return null;
    });
  }

  return (
    <Card title="Apagar conta">
      <div className="grid gap-4">
        <p className="text-body text-ink-muted">Apaga a conta, as turmas que ela dá, as tarefas, os materiais e o histórico sincronizado. Não dá para desfazer.</p>
        <TextField label={`Para confirmar, digite o e-mail ${user.email}`} autoComplete="off" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
        <FormError message={action.error} />
        <div>
          <Button variant="ghost" className="text-off" disabled={action.pending || confirmText.trim().toLowerCase() !== user.email} onClick={remove}>
            Apagar para sempre
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Summary({ user }: { user: AdminUserDetail }) {
  const rows: [string, string][] = [
    ["Criada em", formatDate(user.createdAt)],
    ["Turmas que dá", String(user.classesTaught)],
    ["Turmas em que estuda", String(user.classesJoined)],
    ["Resultados de prática", String(user.practiceResults)],
  ];
  if (user.birthYear) rows.push(["Ano de nascimento", String(user.birthYear)]);
  if (user.guardianName) rows.push(["Responsável", `${user.guardianName}${user.guardianEmail ? ` (${user.guardianEmail})` : ""}`]);
  if (user.guardianConsentAt) rows.push(["Consentimento do responsável", formatDateTime(user.guardianConsentAt)]);

  return (
    <Card title="Resumo">
      <dl className="grid gap-2 text-body">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-hairline pb-2 last:border-0">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="text-ink tabular">{value}</dd>
          </div>
        ))}
      </dl>
      {user.teacherBio ? (
        <div className="mt-4 grid gap-1">
          <p className="text-caption font-medium text-ink-muted">Apresentação como professor</p>
          <p className="whitespace-pre-line text-body text-ink">{user.teacherBio}</p>
        </div>
      ) : null}
    </Card>
  );
}

function UserDetail({ userId }: { userId: string }) {
  const me = useAccount((state) => state.user);
  const detail = useApiData((signal) => api.get<AdminUserDetail>(`/admin/users/${userId}`, signal), [userId]);
  const canManage = can(me, "users.manage");

  return (
    <LoadState {...detail}>
      {(user) => (
        <div className="grid gap-6">
          <PageHeader
            title={user.name}
            back={{ to: "/admin/usuarios", label: "Usuários" }}
            description={
              <span className="flex flex-wrap items-center gap-2">
                {user.email}
                <Badge tone={user.status === "active" ? "good" : "bad"}>{STATUS_LABELS[user.status]}</Badge>
                {user.teacherApplication ? <Badge tone={user.teacherApplication === "pending" ? "warn" : "info"}>{APPLICATION_LABELS[user.teacherApplication]}</Badge> : null}
              </span>
            }
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <Summary user={user} />
            {canManage ? <AccessCard user={user} onChanged={detail.reload} /> : null}
            {canManage ? <ProfileForm key={`${user.name}-${user.email}`} user={user} onChanged={detail.reload} /> : null}
            {canManage ? <RolesForm key={user.roles.join(",")} user={user} onChanged={detail.reload} /> : null}
            {canManage ? <DeleteCard user={user} /> : null}
          </div>
        </div>
      )}
    </LoadState>
  );
}

export function UsuarioPage() {
  const { userId = "" } = useParams();
  return (
    <div className="grid gap-6">
      <Link to="/admin/usuarios" className="text-body text-primary underline-offset-4 hover:underline">
        Voltar para usuários
      </Link>
      <RequireAccount permissions={["users.read"]}>
        <UserDetail userId={userId} />
      </RequireAccount>
    </div>
  );
}
