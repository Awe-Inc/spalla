import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";
import { Navigate, NavLink, useLocation } from "react-router";

import { isPlatformEnabled } from "@/api/client";
import type { Permission } from "@/api/types";
import { EmptyState, InlineError } from "@/design/components";

import { can, useAccount } from "./store";

export const FIELD_CLASS = "h-11 w-full rounded-md border border-hairline bg-surface px-3 text-body text-ink md:h-10";
export const AREA_CLASS = "min-h-28 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-body text-ink";
export const LINK_PRIMARY_CLASS = "inline-flex h-11 items-center justify-center rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors duration-fast ease-fretless hover:bg-primary-hover md:h-10";
export const LINK_SECONDARY_CLASS = "inline-flex h-11 items-center justify-center rounded-pill bg-surface-soft px-5 font-semibold text-ink transition-colors duration-fast ease-fretless hover:bg-surface-sunken md:h-10";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-dica` : undefined;
  const errorId = error ? `${id}-erro` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-body font-medium text-ink">
        {label}
      </label>
      {children(id, describedBy)}
      {hint ? (
        <p id={hintId} className="text-caption text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption font-medium text-off">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, className = "", ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      {(id, describedBy) => <input id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={`${FIELD_CLASS} ${className}`} {...rest} />}
    </FieldShell>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextAreaField({ label, hint, error, className = "", ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      {(id, describedBy) => <textarea id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={`${AREA_CLASS} ${className}`} {...rest} />}
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function SelectField({ label, hint, error, className = "", children, ...rest }: SelectFieldProps) {
  return (
    <FieldShell label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={`${FIELD_CLASS} ${className}`} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

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
    return loading ? (
      <p role="status" className="text-body text-ink-muted">
        Carregando…
      </p>
    ) : null;
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
    return <EmptyState title="Plataforma de aulas desligada" description="Esta instalação do Fretless funciona só no aparelho. Turmas, professores e contas aparecem quando o servidor estiver configurado." />;
  }
  if (!user) return <Navigate to={`/entrar?voltar=${encodeURIComponent(location.pathname)}`} replace />;
  if (permissions.length > 0 && !can(user, ...permissions)) {
    return <EmptyState title="Sem acesso a esta área" description="Sua conta não tem permissão para abrir esta página. Fale com quem administra a plataforma se precisar." />;
  }
  return <>{children}</>;
}

interface SubNavItem {
  to: string;
  label: string;
  end?: boolean;
}

export function SubNav({ items, label }: { items: readonly SubNavItem[]; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-6 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b border-hairline">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                `inline-flex h-11 items-center border-b-2 px-3 text-body font-medium transition-colors duration-fast ease-fretless ${
                  isActive ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  const toneClass = {
    neutral: "bg-surface-soft text-ink-muted",
    good: "bg-in-tune-soft text-ink",
    warn: "bg-close-soft text-ink",
    bad: "bg-off-soft text-ink",
    info: "bg-info-soft text-ink",
  }[tone];
  return <span className={`inline-flex h-6 items-center rounded-pill px-2.5 text-caption font-medium ${toneClass}`}>{children}</span>;
}
