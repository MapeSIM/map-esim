import type { ReactNode } from "react";
import { AdminButton } from "@/app/components/admin/ui/AdminButton";

export type AdminEmptyStateProps = {
  title?: string;
  children: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
};

const EMPTY_SHELL =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--text-muted)] sm:px-5 sm:py-8";

/**
 * Consistent empty / no-results panel with optional next-step CTA.
 */
export function AdminEmptyState({
  title,
  children,
  actionHref,
  actionLabel,
  className,
}: AdminEmptyStateProps) {
  return (
    <div
      className={[EMPTY_SHELL, className].filter(Boolean).join(" ")}
      role="status"
    >
      {title ? (
        <p className="font-medium text-[var(--heading)]">{title}</p>
      ) : null}
      <div className={title ? "mt-2" : undefined}>{children}</div>
      {actionHref && actionLabel ? (
        <div className="mt-4">
          <AdminButton href={actionHref} variant="secondary" size="sm">
            {actionLabel}
          </AdminButton>
        </div>
      ) : null}
    </div>
  );
}
