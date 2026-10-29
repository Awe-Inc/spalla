import { type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link, type LinkProps } from "react-router";

import { Icon, type IconName } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger";
export type ButtonSize = "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary shadow-card hover:bg-primary-hover",
  secondary: "bg-surface-soft text-ink ring-1 ring-inset ring-hairline hover:bg-surface-sunken hover:ring-hairline-strong",
  ghost: "text-ink-muted hover:bg-surface-soft hover:text-ink",
  quiet: "text-primary underline-offset-4 hover:underline",
  danger: "text-off hover:bg-off-soft",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "h-11 gap-2 px-4 text-body",
  lg: "h-13 gap-2.5 px-6 text-heading",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  const shape = variant === "quiet" ? "h-auto min-h-11 gap-1.5 px-1 text-body" : `${SIZE_CLASS[size]} rounded-md`;
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold transition-[background-color,color,box-shadow,transform] duration-fast ease-spalla active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 ${shape} ${VARIANT_CLASS[variant]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode | IconName;
  loading?: boolean;
}

function renderIcon(icon: ReactNode | IconName, size: ButtonSize): ReactNode {
  if (typeof icon === "string") return <Icon name={icon as IconName} className={size === "lg" ? "size-6" : "size-5"} />;
  return icon;
}

export function Button({ variant = "secondary", size = "md", icon, loading = false, className = "", children, disabled, ...rest }: ButtonProps) {
  return (
    <button type="button" className={`${buttonClass(variant, size)} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {icon ? renderIcon(icon, size) : null}
      {children}
      {loading ? <span aria-hidden>…</span> : null}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
}

export function ButtonLink({ variant = "secondary", size = "md", icon, className = "", children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={`${buttonClass(variant, size)} ${className}`} {...rest}>
      {icon ? renderIcon(icon, size) : null}
      {children}
    </Link>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  label: string;
  variant?: Extract<ButtonVariant, "ghost" | "secondary" | "primary" | "danger">;
}

export function IconButton({ icon, label, variant = "ghost", className = "", ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} className={`${buttonClass(variant)} w-11 px-0 ${className}`} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  question?: string;
  onConfirm: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
}

export function ConfirmButton({ label, confirmLabel = label, question = "Tem certeza?", onConfirm, icon, variant = "danger" }: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);
  if (!asking) {
    return (
      <Button variant={variant} {...(icon ? { icon } : {})} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span role="group" aria-label={question} className="inline-flex animate-rise items-center gap-1 rounded-md bg-off-soft py-0.5 pl-3 pr-0.5">
      <span className="text-small text-ink">{question}</span>
      <button
        ref={confirmRef}
        type="button"
        className={`${buttonClass("danger")} h-10 px-3 text-small`}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className={`${buttonClass("ghost")} h-10 px-3 text-small`} onClick={() => setAsking(false)}>
        Cancelar
      </button>
    </span>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: IconName;
  tone?: "default" | "danger";
}

interface MenuProps {
  label: string;
  items: readonly MenuItem[];
  trigger?: ReactNode;
  align?: "start" | "end";
}

export function Menu({ label, items, trigger, align = "end" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const entries = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const current = entries.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    entries[(current + step + entries.length) % entries.length]?.focus();
  };

  return (
    <div ref={rootRef} className="relative inline-flex" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={trigger ? undefined : label}
        title={trigger ? undefined : label}
        className={trigger ? buttonClass("secondary") : `${buttonClass("ghost")} w-11 px-0`}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger ?? <Icon name="acoes" />}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute top-full z-30 mt-1.5 grid min-w-52 origin-top animate-rise gap-0.5 rounded-md bg-surface p-1.5 shadow-overlay ring-1 ring-hairline ${align === "end" ? "right-0" : "left-0"}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`flex h-11 items-center gap-3 rounded-sm px-3 text-left text-body font-medium transition-colors duration-fast ease-spalla focus-visible:outline-offset-0 ${
                item.tone === "danger" ? "text-off hover:bg-off-soft" : "text-ink hover:bg-surface-soft"
              }`}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.icon ? <Icon name={item.icon} className="size-5 opacity-80" /> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
