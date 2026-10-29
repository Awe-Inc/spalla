import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { isPlatformEnabled } from "@/api/client";
import type { Permission } from "@/api/types";
import { EmptyState, InlineError } from "@/design/components";
import { SkeletonList } from "@/design/layout";

import { can, useAccount } from "./store";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-off-soft px-4 py-3 text-body text-ink">
      {message}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-md bg-in-tune-soft px-4 py-3 text-body text-ink">
      {children}
    </p>
  );
}

interface LoadStateProps<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  children: (data: T) => ReactNode;
}

export function LoadState<T>({ data, error, loading, children }: LoadStateProps<T>) {
  if (error && data === undefined) return <InlineError title={error} nextStep="Recarregue a página ou tente de novo em alguns instantes." />;
  if (data === undefined) {
    return loading ? <SkeletonList /> : null;
  }
  return <>{children(data)}</>;
}

interface RequireAccountProps {
  permissions?: readonly Permission[];
  children: ReactNode;
}

export function RequireAccount({ permissions = [], children }: RequireAccountProps) {
  const user = useAccount((state) => state.user);
  const location = useLocation();
  if (!isPlatformEnabled()) {
    return <EmptyState title="Plataforma de aulas desligada" description="Esta instalação do Spalla funciona só no aparelho. Turmas, professores e contas aparecem quando o servidor estiver configurado." />;
  }
  if (!user) return <Navigate to={`/entrar?voltar=${encodeURIComponent(location.pathname)}`} replace />;
  if (permissions.length > 0 && !can(user, ...permissions)) {
    return <EmptyState title="Sem acesso a esta área" description="Sua conta não tem permissão para abrir esta página. Fale com quem administra a plataforma se precisar." />;
  }
  return <>{children}</>;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
