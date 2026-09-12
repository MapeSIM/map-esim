import type { PartnerOrderStatusBadge } from "@/app/lib/partner/partnerOrdersDisplay";

/** Shared Partner Portal presentation only. No API or permission changes. */

export const partnerCardClass =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 sm:p-6";

export const partnerInsetCardClass =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5";

export const partnerSectionLabelClass =
  "text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]";

export const partnerSectionTitleClass =
  "text-base font-semibold tracking-tight text-[var(--heading)]";

export const partnerPrimaryCtaClass =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] outline-none transition hover:bg-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60";

export const partnerSecondaryCtaClass =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none transition hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60";

export const partnerQuietCtaClass =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-transparent px-4 text-sm font-semibold text-[var(--text)] outline-none transition hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60";

export const partnerDangerCtaClass =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger-border)] px-4 text-sm font-semibold text-[var(--danger-text)] outline-none transition hover:bg-[var(--danger-bg)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60";

export const partnerFieldClass =
  "mt-1.5 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]";

export function partnerStatusBadgeClass(status: PartnerOrderStatusBadge): string {
  switch (status) {
    case "Completed":
      return "bg-[var(--accent)]/15 text-[var(--heading)] border-[var(--accent-strong)]/40";
    case "Processing":
      return "bg-[var(--surface)] text-[var(--text)] border-[var(--border-hover)]";
    case "Under review":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Failed — balance returned":
      return "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]";
    default:
      return "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]";
  }
}
