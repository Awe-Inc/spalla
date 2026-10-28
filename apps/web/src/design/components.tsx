import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  secondary: "bg-surface-soft text-ink hover:bg-surface-sunken",
  ghost: "bg-transparent text-ink-muted hover:text-ink hover:bg-surface-soft",
};

export function Button({ variant = "secondary", icon, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-pill px-5 text-body font-semibold transition-colors duration-fast ease-fretless disabled:cursor-not-allowed disabled:opacity-50 md:h-10 ${buttonVariantClass[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}

export function Card({ title, children, className = "", as: Tag = "section" }: CardProps) {
  return (
    <Tag className={`rounded-lg bg-surface p-6 shadow-card ${className}`}>
      {title ? <h2 className="mb-3 text-heading font-semibold">{title}</h2> : null}
      {children}
    </Tag>
  );
}

export const STRING_NAMES = ["Sol", "Ré", "Lá", "Mi"] as const;
const stringClass = ["bg-string-g", "bg-string-d", "bg-string-a", "bg-string-e"] as const;

export function StringChip({ index }: { index: number }) {
  const name = STRING_NAMES[index] ?? "?";
  const color = stringClass[index] ?? "bg-ink-subtle";
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-pill bg-surface-soft pl-2.5 pr-3 text-caption font-medium text-ink">
      <span aria-hidden className={`size-2.5 rounded-pill ${color}`} />
      {name}
    </span>
  );
}

export function Stars({ count, label }: { count: 0 | 1 | 2 | 3; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={label ?? `${count} de 3 estrelas`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className={`size-5 ${i < count ? "fill-close" : "fill-hairline-strong"}`} aria-hidden>
          <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L10 14.9l-5.3 2.8 1.1-5.9L1.5 7.7l5.9-.8z" />
        </svg>
      ))}
      {label ? <span className="ml-1 text-caption text-ink-subtle">{label}</span> : null}
    </span>
  );
}

export function GoalDots({ recentClean, total, label }: { recentClean: readonly boolean[]; total: number; label: string }) {
  const slots = Array.from({ length: total }, (_, index) => recentClean[index] ?? null);
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={label}>
      {slots.map((clean, index) => (
        <span key={index} className={`size-2.5 rounded-pill ${clean === null ? "bg-hairline-strong" : clean ? "bg-in-tune" : "bg-off"}`} />
      ))}
    </span>
  );
}

export function accuracyToneClass(accuracyPct: number): string {
  if (accuracyPct >= 90) return "bg-in-tune";
  if (accuracyPct >= 70) return "bg-close";
  return "bg-off";
}

export interface AccuracyBar {
  key: string | number;
  accuracyPct: number;
  bpm: number;
}

export function AccuracyBars({ bars, label, className = "h-32" }: { bars: readonly AccuracyBar[]; label: string; className?: string }) {
  return (
    <ol className={`flex items-end gap-2 ${className}`} aria-label={label}>
      {bars.map((bar) => (
        <li key={bar.key} className="flex flex-1 flex-col items-center gap-1">
          <span className="font-mono text-caption text-ink-subtle tabular">{Math.round(bar.accuracyPct)}</span>
          <div className="flex w-full flex-1 items-end">
            <div className={`w-full rounded-sm ${accuracyToneClass(bar.accuracyPct)}`} style={{ height: `${Math.max(4, bar.accuracyPct)}%` }} aria-label={`${Math.round(bar.accuracyPct)}% a ${bar.bpm} bpm`} />
          </div>
          <span className="font-mono text-caption text-ink-subtle tabular">{bar.bpm}</span>
        </li>
      ))}
    </ol>
  );
}

interface ProgressRingProps {
  value: number;
  max: number;
  caption: string;
  size?: number;
}

export function ProgressRing({ value, max, caption, size = 112 }: ProgressRingProps) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <figure className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-surface-sunken" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="stroke-primary transition-[stroke-dashoffset] duration-slow ease-fretless"
        />
      </svg>
      <figcaption className="absolute inset-0 grid place-content-center text-center">
        <span className="font-mono text-numeric tabular">{value}</span>
        <span className="text-caption text-ink-subtle">{caption}</span>
      </figcaption>
    </figure>
  );
}

export function HeadphoneNotice({ onConfirm }: { onConfirm: () => void }) {
  return (
    <aside className="flex flex-wrap items-center gap-4 rounded-md bg-info-soft p-4 text-ink" role="note">
      <svg viewBox="0 0 24 24" className="size-6 shrink-0 stroke-info" fill="none" strokeWidth="1.8" aria-hidden>
        <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
        <rect x="3" y="13" width="4" height="7" rx="1.5" />
        <rect x="17" y="13" width="4" height="7" rx="1.5" />
      </svg>
      <p className="flex-1 text-body">Este exercício toca um drone. Use fone para o microfone ouvir só o violino.</p>
      <Button variant="ghost" onClick={onConfirm}>
        Estou de fone
      </Button>
    </aside>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="grid justify-items-center gap-4 rounded-lg bg-surface px-6 py-12 text-center shadow-card">
      <svg viewBox="0 0 64 64" className="size-16 stroke-ink-subtle" fill="none" strokeWidth="1.5" aria-hidden>
        <path d="M18 50 L30 14 M28 52 L36 14 M40 52 L44 14 M50 50 L51 14" strokeLinecap="round" />
        <circle cx="34" cy="32" r="5" />
      </svg>
      <h2 className="text-heading font-semibold">{title}</h2>
      <p className="max-w-prose text-body text-ink-muted">{description}</p>
      {action}
    </div>
  );
}

interface InlineErrorProps {
  title: string;
  nextStep: string;
}

export function InlineError({ title, nextStep }: InlineErrorProps) {
  return (
    <div className="rounded-md bg-off-soft p-4 text-ink" role="alert">
      <p className="font-semibold">{title}</p>
      <p className="text-ink-muted">{nextStep}</p>
    </div>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-1 text-body text-ink-muted">{eyebrow}</p> : null}
        <h1 className="font-display text-display">{title}</h1>
      </div>
      {children}
    </header>
  );
}
