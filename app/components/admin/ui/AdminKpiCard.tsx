import Link from "next/link";
import type { ReactNode } from "react";

export type AdminKpiCardProps = {
  label: string;
  value: string | number;
  note?: ReactNode;
  className?: string;
  /** Optional deep link — card becomes a navigable summary (presentation only). */
  href?: string;
};

/**
 * Presentational KPI / stat card. Matches Overview + Payments hub styling.
 */
export function AdminKpiCard({
  label,
  value,
  note,
  className,
  href,
}: AdminKpiCardProps) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--heading)]">
        {value}
      </p>
      {note ? (
        <p className="mt-2 text-xs leading-snug text-[var(--text-muted)]">{note}</p>
      ) : null}
    </>
  );

  const shellClass = [
    "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4",
    href
      ? "block outline-none transition hover:border-[var(--accent-strong)]/40 focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={shellClass}>
        {body}
      </Link>
    );
  }

  return <div className={shellClass}>{body}</div>;
}
