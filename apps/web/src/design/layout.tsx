import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";

import { Icon } from "./icons";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
  size?: "display" | "title";
  isWorkTitle?: boolean;
}

export function PageHeader({ title, description, back, actions, size = "title", isWorkTitle = false }: PageHeaderProps) {
  return (
    <header className="mb-8 grid gap-3">
      {back ? (
        <Link to={back.to} className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-sm pr-2 text-small font-medium text-ink-muted transition-colors duration-fast ease-spalla hover:text-ink">
          <Icon name="voltar" className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="grid min-w-0 gap-2">
          <h1 className={`font-display ${size === "display" ? "text-display" : "text-title"} ${isWorkTitle ? "italic" : ""}`}>{title}</h1>
          {description ? <p className="max-w-prose text-body text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export interface TabItem {
  to: string;
  label: string;
  end?: boolean;
  count?: number;
  active?: boolean;
}

function tabClass(isActive: boolean): string {
  return `inline-flex h-10 items-center gap-2 rounded-sm px-4 text-small font-semibold transition-[background-color,color,box-shadow] duration-fast ease-spalla ${
    isActive ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink"
  }`;
}

function TabCount({ count }: { count: number | undefined }) {
  if (count === undefined || count <= 0) return null;
  return <span className="rounded-sm bg-primary-soft px-1.5 font-mono text-caption text-primary tabular">{count}</span>;
}

export function Tabs({ items, label }: { items: readonly TabItem[]; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-8 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="inline-flex min-w-max gap-1 rounded-md bg-surface-sunken p-1 ring-1 ring-inset ring-hairline">
        {items.map((item) => (
          <li key={item.to}>
            {item.active === undefined ? (
              <NavLink to={item.to} end={item.end ?? false} className={({ isActive }) => tabClass(isActive)}>
                {item.label}
                <TabCount count={item.count} />
              </NavLink>
            ) : (
              <Link to={item.to} aria-current={item.active ? "page" : undefined} className={tabClass(item.active)}>
                {item.label}
                <TabCount count={item.count} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface SectionProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ title, description, action, children, className = "" }: SectionProps) {
  return (
    <section className={`grid gap-4 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-heading font-semibold">{title}</h2>
          {description ? <p className="max-w-prose text-small text-ink-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function List({ label, children, className = "" }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <ul aria-label={label} className={`divide-y divide-hairline overflow-hidden rounded-lg bg-surface shadow-card ring-1 ring-hairline/60 ${className}`}>
      {children}
    </ul>
  );
}

interface ListRowProps {
  title: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  to?: string;
  current?: boolean;
  className?: string;
}

export function ListRow({ title, meta, leading, trailing, to, current = false, className = "" }: ListRowProps) {
  const titleNode = to ? (
    <Link to={to} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus">
      {title}
    </Link>
  ) : (
    title
  );
  return (
    <li
      aria-current={current ? "step" : undefined}
      className={`relative flex min-h-16 items-center gap-4 px-4 py-3 transition-colors duration-fast ease-spalla md:px-5 ${to ? "hover:bg-surface-soft" : ""} ${current ? "bg-primary-soft/60 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-pill before:bg-primary" : ""} ${className}`}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="truncate text-body font-semibold text-ink">{titleNode}</div>
        {meta ? <div className="text-small text-ink-muted">{meta}</div> : null}
      </div>
      {trailing ? <div className="relative z-10 flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </li>
  );
}

export function Stat({ value, label, tone = "ink" }: { value: ReactNode; label: string; tone?: "ink" | "primary" }) {
  return (
    <div className="grid gap-1">
      <dt className="order-2 text-small text-ink-muted">{label}</dt>
      <dd className={`order-1 font-mono text-numeric tabular ${tone === "primary" ? "text-primary" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

export function Stats({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  return (
    <dl aria-label={label} className={`grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] ${className}`}>
      {children}
    </dl>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-sm bg-surface-soft ${className}`} />;
}

export function SkeletonList({ rows = 3, label = "Carregando…" }: { rows?: number; label?: string }) {
  return (
    <div role="status" className="grid gap-px overflow-hidden rounded-lg bg-hairline/60 shadow-card">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 bg-surface px-5 py-4">
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
      ))}
    </div>
  );
}
