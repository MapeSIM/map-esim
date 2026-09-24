import type { ReactNode } from "react";
import {
  ADMIN_MUTED_COPY_CLASS,
  ADMIN_SOFT_COPY_CLASS,
} from "@/app/components/admin/ui/adminSurfaceClasses";

export type AdminPageHeaderProps = {
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
};

/**
 * Consistent Admin page title block (presentation only).
 */
export function AdminPageHeader({
  title,
  description,
  meta,
  actions,
}: AdminPageHeaderProps) {
  return (
    <header className="min-w-0 space-y-3">
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
          {title}
        </h1>
        {description ? (
          <div className={`mt-2 max-w-3xl ${ADMIN_MUTED_COPY_CLASS}`}>
            {description}
          </div>
        ) : null}
        {meta ? (
          <div className={`mt-2 ${ADMIN_SOFT_COPY_CLASS}`}>{meta}</div>
        ) : null}
      </div>
    </header>
  );
}
