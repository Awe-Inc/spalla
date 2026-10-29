import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { api, apiBlob, errorMessage } from "@/api/client";
import type { AccountSession, Me } from "@/api/types";
import { useApiData } from "@/api/useApiData";
import { MIN_PASSWORD_LENGTH } from "@/account/forms";
import { syncPractice } from "@/account/practiceSync";
import { can, isAdminUser, isStudentUser, isTeacherUser, logout, useAccount } from "@/account/store";
import { Badge, FormError, formatDateTime, LoadState, Notice, RequireAccount, TextAreaField, TextField } from "@/account/ui";
import { downloadBlob } from "@/data/backup";
import { Button, Card, PageTitle } from "@/design/components";

const APPLICATION_TEXT: Record<NonNullable<Me["teacherApplication"]>, { label: string; tone: "warn" | "good" | "bad"; text: string }> = {
  pending: { label: "Em análise", tone: "warn", text: "A equipe está analisando seu pedido de conta de professor. Você recebe acesso às turmas assim que for aprovado." },
  approved: { label: "Aprovado", tone: "good", text: "Sua conta de professor está liberada." },
  rejected: { label: "Não aprovado", tone: "bad", text: "O pedido de conta de professor não foi aprovado. Fale com o suporte se quiser rever." },
};

function ProfileCard({ user }: { user: Me }) {
  const setUser = useAccount((state) => state.setUser);
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.teacherBio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const showBio = user.teacherApplication !== null || isTeacherUser(user);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      setUser(await api.patch<Me>("/auth/me", { name: name.trim(), ...(showBio ? { teacherBio: bio.trim() } : {}) }));
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  const application = user.teacherApplication ? APPLICATION_TEXT[user.teacherApplication] : null;
  return (
    <Card title="Perfil">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-body text-ink-muted">{user.email}</p>
        {application ? (
          <div className="grid gap-2 rounded-md bg-surface-soft p-4">
            <span className="flex items-center gap-2 text-body font-medium">
              Conta de professor <Badge tone={application.tone}>{application.label}</Badge>
            </span>
            <p className="text-caption text-ink-muted">{application.text}</p>
          </div>
        ) : null}
        <TextField label="Nome" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        {showBio ? <TextAreaField label="Sobre suas aulas" value={bio} maxLength={1000} onChange={(event) => setBio(event.target.value)} /> : null}
        <FormError message={error} />
        {saved ? <Notice>Perfil salvo.</Notice> : null}
        <div>
          <Button type="submit" variant="primary" disabled={pending || name.trim().length < 2}>
            Salvar perfil
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SyncCard({ user }: { user: Me }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const outcome = await syncPractice(user.id);
      setMessage(outcome.sent === 0 ? "Nada novo para enviar." : `${outcome.inserted} sessões novas enviadas ao professor.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Prática enviada ao professor">
      <div className="grid gap-4">
        <p className="text-body text-ink-muted">
          Sua prática fica guardada neste aparelho. Envie o resumo das sessões para que seu professor acompanhe afinação, andamento e constância. O áudio nunca é enviado.
        </p>
        <FormError message={error} />
        {message ? <Notice>{message}</Notice> : null}
        <div>
          <Button variant="primary" onClick={run} disabled={pending}>
            {pending ? "Enviando…" : "Enviar prática agora"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await api.post("/auth/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Senha">
      <form onSubmit={submit} className="grid gap-4">
        <TextField label="Senha atual" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        <TextField
          label="Senha nova"
          type="password"
          autoComplete="new-password"
          hint={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres. As outras sessões serão encerradas.`}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <FormError message={error} />
        {saved ? <Notice>Senha trocada.</Notice> : null}
        <div>
          <Button type="submit" disabled={pending || !currentPassword || newPassword.length < MIN_PASSWORD_LENGTH}>
            Trocar senha
          </Button>
        </div>
      </form>
    </Card>
  );
}

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return "Aparelho desconhecido";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Navegador";
  const system = /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Windows/.test(userAgent) ? "Windows" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "";
  return system ? `${browser} no ${system}` : browser;
}

function SessionsCard() {
  const sessions = useApiData((signal) => api.get<AccountSession[]>("/auth/sessions", signal), []);
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string) {
    setError(null);
    try {
      await api.delete(`/auth/sessions/${id}`);
      sessions.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card title="Onde sua conta está aberta">
      <LoadState {...sessions}>
        {(list) => (
          <ul className="grid gap-2">
            {list.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-soft px-4 py-3">
                <div>
                  <p className="text-body font-medium">
                    {describeAgent(session.userAgent)} {session.current ? <Badge tone="info">Este aparelho</Badge> : null}
                  </p>
                  <p className="text-caption text-ink-muted">Último uso {formatDateTime(session.lastSeenAt)}</p>
                </div>
                {session.current ? null : (
                  <Button variant="ghost" onClick={() => revoke(session.id)}>
                    Encerrar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </LoadState>
      <FormError message={error} />
    </Card>
  );
}

function DataCard() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function exportData() {
    setError(null);
    try {
      downloadBlob("fretless-meus-dados.json", await apiBlob("/auth/export"));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.delete("/auth/account", { password });
      useAccount.getState().clear();
      navigate("/", { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Seus dados">
      <div className="grid gap-4">
        <p className="text-body text-ink-muted">Baixe tudo o que a plataforma guarda sobre você num arquivo JSON, ou apague a conta de vez.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportData}>Baixar meus dados</Button>
          {confirming ? null : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Apagar conta
            </Button>
          )}
        </div>
        {confirming ? (
          <form onSubmit={deleteAccount} className="grid gap-3 rounded-md bg-off-soft p-4">
            <p className="text-body font-medium">Apagar a conta remove seu perfil, turmas, tarefas e prática enviada. Não dá para desfazer.</p>
            <p className="text-caption text-ink-muted">A prática guardada neste aparelho continua aqui.</p>
            <TextField label="Digite sua senha para confirmar" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={pending || !password}>
                Apagar minha conta
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}
        <FormError message={error} />
      </div>
    </Card>
  );
}

function AreaLinks({ user }: { user: Me }) {
  const links = [
    isStudentUser(user) ? { to: "/aulas", label: "Minhas aulas", text: "Tarefas, materiais e planos do professor." } : null,
    isTeacherUser(user) ? { to: "/professor", label: "Área do professor", text: "Turmas, tarefas, materiais e progresso dos alunos." } : null,
    isAdminUser(user) ? { to: "/admin", label: "Administração", text: "Usuários, papéis, convites e auditoria." } : null,
  ].filter((link): link is { to: string; label: string; text: string } => link !== null);
  if (links.length === 0) {
    return (
      <Card title="Entrar numa turma">
        <p className="mb-4 text-body text-ink-muted">Tem o código da turma do seu professor? Entre por Minhas aulas.</p>
        <Link to="/aulas" className="text-body font-medium text-primary underline-offset-4 hover:underline">
          Ir para Minhas aulas
        </Link>
      </Card>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {links.map((link) => (
        <Link key={link.to} to={link.to} className="grid gap-1 rounded-lg bg-surface p-5 shadow-card transition-colors duration-fast ease-spalla hover:bg-surface-soft">
          <span className="text-heading font-semibold text-ink">{link.label}</span>
          <span className="text-caption text-ink-muted">{link.text}</span>
        </Link>
      ))}
    </div>
  );
}

function AccountContent({ user }: { user: Me }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (
    <div className="grid gap-6">
      <PageTitle title="Minha conta" eyebrow={user.name}>
        <Button
          variant="ghost"
          onClick={async () => {
            await logout().catch(() => undefined);
            navigate("/", { replace: true });
          }}
        >
          Sair
        </Button>
      </PageTitle>
      {params.get("nova") ? <Notice>Conta criada. Bem-vindo ao Fretless.</Notice> : null}
      <AreaLinks user={user} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard user={user} />
        {can(user, "practice.sync") ? <SyncCard user={user} /> : null}
        <PasswordCard />
        <SessionsCard />
        <DataCard />
      </div>
    </div>
  );
}

export function ContaPage() {
  const user = useAccount((state) => state.user);
  return <RequireAccount>{user ? <AccountContent user={user} /> : null}</RequireAccount>;
}
