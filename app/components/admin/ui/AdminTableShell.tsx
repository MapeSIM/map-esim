import type { ReactNode } from "react";
import {
  ADMIN_TABLE_HEAD_CLASS,
  ADMIN_TABLE_WRAP_CLASS,
} from "@/app/components/admin/ui/adminSurfaceClasses";

export type AdminTableShellProps = {
  children: ReactNode;
  /** Optional caption for accessibility. */
  caption?: string;
  minWidthClassName?: string;
  className?: string;
};

/**
 * Horizontally scrollable table shell for Admin lists (mobile-friendly).
 */
export function AdminTableShell({
  children,
  caption,
  minWidthClassName = "min-w-[720px]",
  className,
}: AdminTableShellProps) {
  return (
    <div
      className={[ADMIN_TABLE_WRAP_CLASS, className].filter(Boolean).join(" ")}
    >
      <table
        className={[
          minWidthClassName,
          "w-full border-collapse divide-y divide-[var(--border)] text-left text-sm",
        ].join(" ")}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
  return <thead className={ADMIN_TABLE_HEAD_CLASS}>{children}</thead>;
}

export function AdminTableBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
      {children}
    </tbody>
  );
}
