import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function AccountActionRow({
  href,
  title,
  subtitle,
  icon,
  emphasize = false,
  trailing,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  emphasize?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        emphasize
          ? "flex items-center gap-3 rounded-2xl border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 px-4 py-4 transition hover:bg-[var(--accent-strong)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          : "flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      }
    >
      <span
        className={
          emphasize
            ? "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)]"
            : "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--accent-strong)]"
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-[var(--heading)]">
          {title}
        </span>
        <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
          {subtitle}
        </span>
        {trailing}
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-[var(--text-soft)]"
        aria-hidden="true"
      />
    </Link>
  );
}
