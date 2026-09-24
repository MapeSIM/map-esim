import type { ReactNode } from "react";
import {
  ADMIN_FILTER_CONTROL_CLASS,
  ADMIN_FILTER_LABEL_CLASS,
  ADMIN_FILTER_PANEL_CLASS,
} from "@/app/components/admin/ui/adminSurfaceClasses";

export type AdminFilterPanelProps = {
  children: ReactNode;
  className?: string;
  /** Accessible name for the filter form region. */
  "aria-label"?: string;
};

/**
 * Shared Admin GET-filter panel chrome (presentation only).
 */
export function AdminFilterPanel({
  children,
  className,
  "aria-label": ariaLabel = "Filters",
}: AdminFilterPanelProps) {
  return (
    <form
      method="get"
      aria-label={ariaLabel}
      className={[ADMIN_FILTER_PANEL_CLASS, className].filter(Boolean).join(" ")}
    >
      {children}
    </form>
  );
}

export function AdminFilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={["block text-sm", className].filter(Boolean).join(" ")}>
      <span className={ADMIN_FILTER_LABEL_CLASS}>{label}</span>
      {children}
    </label>
  );
}

export const adminFilterControlClassName = ADMIN_FILTER_CONTROL_CLASS;
