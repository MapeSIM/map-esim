import type { ProviderLifecycleCacheView } from "@/app/lib/orders/providerLifecycleShared";

function lifecycleBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "ACTIVE":
      return "border-[var(--accent-strong)]/45 bg-[var(--accent-strong)]/14 text-[var(--heading)]";
    case "DEPLETED":
      return "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]";
    case "EXPIRED":
      return "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]";
    case "NOT_ACTIVE":
      return "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--heading)]";
    default:
      return "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]";
  }
}

/** Cached VeSIM line-state + remaining data chips for list/detail cards. */
export function EsimLifecycleBadges({
  lifecycle,
  remainingDataLabel,
}: {
  lifecycle?: ProviderLifecycleCacheView | null;
  remainingDataLabel?: string | null;
}) {
  if (!lifecycle?.lifecycleLabel && !remainingDataLabel) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {lifecycle?.lifecycleLabel ? (
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${lifecycleBadgeClass(lifecycle.lifecycleStatus)}`}
          data-provider-lifecycle={lifecycle.lifecycleStatus ?? "unknown"}
        >
          {lifecycle.lifecycleLabel}
        </span>
      ) : null}
      {remainingDataLabel ? (
        <span className="inline-flex rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--heading)]">
          {remainingDataLabel}
        </span>
      ) : null}
    </div>
  );
}
