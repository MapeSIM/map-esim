import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type AdminButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type AdminButtonSize = "sm" | "md";

const VARIANT_CLASS: Record<AdminButtonVariant, string> = {
  primary:
    "bg-[var(--accent-strong)] text-white hover:opacity-95 disabled:opacity-60",
  secondary:
    "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--heading)] hover:bg-[var(--surface-2)] disabled:opacity-60",
  danger:
    "border border-[var(--danger-border)] text-[var(--danger-text)] hover:bg-[var(--surface-2)] disabled:opacity-60",
  ghost:
    "text-[var(--accent-strong)] hover:bg-[var(--accent-strong)]/12 disabled:opacity-60",
};

const SIZE_CLASS: Record<AdminButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-4 text-sm",
};

const BASE_CLASS =
  "inline-flex items-center justify-center rounded-xl font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-not-allowed";

export function adminButtonClassName(
  variant: AdminButtonVariant = "primary",
  size: AdminButtonSize = "md",
  className?: string
): string {
  return [BASE_CLASS, SIZE_CLASS[size], VARIANT_CLASS[variant], className]
    .filter(Boolean)
    .join(" ");
}

export type AdminButtonProps = {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  className?: string;
  children: ReactNode;
  href?: string;
  disabled?: boolean;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  formAction?: ButtonHTMLAttributes<HTMLButtonElement>["formAction"];
  name?: string;
  value?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
};

/**
 * Presentational admin action control. Renders a button or Link; no business logic.
 */
export function AdminButton({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
  disabled,
  type = "button",
  formAction,
  name,
  value,
  onClick,
}: AdminButtonProps) {
  const classes = adminButtonClassName(variant, size, className);

  if (href) {
    if (disabled) {
      return (
        <span
          className={`${classes} pointer-events-none opacity-50`}
          aria-disabled="true"
        >
          {children}
        </span>
      );
    }
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled}
      formAction={formAction}
      name={name}
      value={value}
      onClick={onClick}
      className={classes}
    >
      {children}
    </button>
  );
}
