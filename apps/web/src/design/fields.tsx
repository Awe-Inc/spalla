import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";

export const FIELD_CLASS =
  "h-11 w-full rounded-sm bg-surface-sunken px-3 text-body text-ink ring-1 ring-inset ring-hairline transition-[box-shadow,background-color] duration-fast ease-spalla placeholder:text-ink-subtle hover:ring-hairline-strong focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus aria-invalid:ring-off";
export const AREA_CLASS = `${FIELD_CLASS} h-auto min-h-28 py-2.5`;

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

export function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-dica` : undefined;
  const errorId = error ? `${id}-erro` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-small font-semibold text-ink">
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

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
}

function shellProps({ label, hint, error }: FieldProps) {
  return { label, ...(hint ? { hint } : {}), ...(error ? { error } : {}) };
}

export function TextField({ label, hint, error, className = "", ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell {...shellProps({ label, hint, error })}>
      {(id, describedBy) => <input id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={`${FIELD_CLASS} ${className}`} {...rest} />}
    </FieldShell>
  );
}

export function TextAreaField({ label, hint, error, className = "", ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell {...shellProps({ label, hint, error })}>
      {(id, describedBy) => <textarea id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={`${AREA_CLASS} ${className}`} {...rest} />}
    </FieldShell>
  );
}

export function SelectField({ label, hint, error, className = "", children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <FieldShell {...shellProps({ label, hint, error })}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={`${FIELD_CLASS} cursor-pointer pr-8 ${className}`} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
}

interface ChoiceChipsProps<T extends string | number> {
  name: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  label?: string;
}

export function ChoiceChips<T extends string | number>({ name, value, options, onChange, label }: ChoiceChipsProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-md bg-surface-sunken p-1 ring-1 ring-inset ring-hairline">
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className={`inline-flex h-10 cursor-pointer items-center rounded-sm px-4 text-small font-semibold transition-[background-color,color,box-shadow] duration-fast ease-spalla has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus ${
              checked ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink"
            }`}
          >
            <input type="radio" name={name} value={String(option.value)} checked={checked} onChange={() => onChange(option.value)} className="sr-only" />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export type BadgeTone = "neutral" | "good" | "warn" | "bad" | "info" | "accent";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-soft text-ink-muted",
  good: "bg-in-tune-soft text-ink",
  warn: "bg-close-soft text-ink",
  bad: "bg-off-soft text-ink",
  info: "bg-info-soft text-ink",
  accent: "bg-primary-soft text-ink",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`inline-flex h-6 items-center rounded-sm px-2 text-caption font-medium ${BADGE_TONE[tone]}`}>{children}</span>;
}
