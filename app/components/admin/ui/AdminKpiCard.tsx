import type { ReactNode } from "react";

export type AdminKpiCardProps = {
  label: string;
  value: string | number;
  note?: ReactNode;
  className?: string;
};

/**
 * Presentational KPI / stat card. Matches Overview + Payments hub styling.
 */
export function AdminKpiCard({
  label,
  value,
  note,
  className,
}: AdminKpiCardProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--heading)]">
        {value}
      </p>
      {note ? (
        <p className="mt-2 text-xs leading-snug text-[var(--text-muted)]">{note}</p>
      ) : null}
    </div>
  );
}
