import { Link, useNavigate, useSearchParams } from "react-router";

import { isPlatformEnabled } from "@/api/client";
import type { Me } from "@/api/types";
import { can, isAdminUser, isStudentUser, isTeacherUser, logout, useAccount } from "@/account/store";
import { Notice } from "@/account/ui";
import { VoceTabs } from "@/areas/voce/VoceTabs";
import { Button, ButtonLink, Card, EmptyState, PageHeader } from "@/design/components";

import { PasswordCard, ProfileCard, SyncCard } from "./ContaPerfilCards";
import { DataCard, SessionsCard } from "./ContaSegurancaCards";

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
      <PageHeader
        title="Você"
        description={`Conta de ${user.name}`}
        actions={
          <>
            <Button
              variant="ghost"
              onClick={async () => {
                await logout().catch(() => undefined);
                navigate("/", { replace: true });
              }}
            >
              Sair
            </Button>
          </>
        }
      />
      <VoceTabs />
      {params.get("nova") ? <Notice>Conta criada. Bem-vindo ao Spalla.</Notice> : null}
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

function SignedOut() {
  return (
    <>
      <PageHeader title="Você" />
      <VoceTabs />
      {isPlatformEnabled() ? (
        <Card tone="hero" className="grid max-w-2xl gap-4">
          <h2 className="text-heading font-semibold">Entre para estudar com uma turma.</h2>
          <p className="text-body text-ink-muted">A conta liga você a uma professora: tarefas da aula, materiais e seu progresso compartilhado. Tudo o que você toca continua guardado neste aparelho, com ou sem conta.</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/entrar?voltar=%2Fvoce%2Fconta" variant="primary" icon="entrar">
              Entrar
            </ButtonLink>
            <ButtonLink to="/criar-conta" variant="secondary">
              Criar conta
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <EmptyState title="Plataforma de aulas desligada" description="Esta instalação do Spalla funciona só no aparelho. Turmas, professores e contas aparecem quando o servidor estiver configurado." />
      )}
    </>
  );
}

export function ContaPage() {
  const user = useAccount((state) => state.user);
  return user ? <AccountContent user={user} /> : <SignedOut />;
}
