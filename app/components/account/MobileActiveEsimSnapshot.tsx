import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Signal } from "lucide-react";
import type { CustomerMobileEsimSnapshot } from "@/app/lib/orders/customerMobileEsimSnapshot";

/**
 * Mobile-first data usage strip for the account dashboard.
 * Renders from local lifecycle cache — no client VeSIM fetch on first paint.
 */
export default function MobileActiveEsimSnapshot({
  snapshot,
}: {
  snapshot: CustomerMobileEsimSnapshot;
}) {
  const href = `/account/orders/${encodeURIComponent(snapshot.orderId)}`;
  const remaining =
    snapshot.remainingDataLabel ??
    (snapshot.lifecycle.lifecycleLabel
      ? snapshot.lifecycle.lifecycleLabel
      : "Open for live usage");
  const status = snapshot.lifecycle.lifecycleLabel ?? "eSIM";

  return (
    <section
      className="lg:hidden"
      aria-label="Active eSIM data balance"
    >
      <Link
        href={href}
        className="block overflow-hidden rounded-2xl border border-[var(--accent-strong)]/35 bg-gradient-to-br from-[var(--accent-strong)]/18 via-[var(--surface)] to-[var(--surface-2)] p-4 shadow-[0_10px_28px_rgba(0,0,0,0.12)] transition hover:border-[var(--accent-strong)]/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)]">
            {snapshot.flagUrl ? (
              <Image
                src={snapshot.flagUrl}
                alt=""
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            ) : (
              <Signal
                className="h-5 w-5 text-[var(--accent-strong)]"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]">
                Data balance
              </p>
              <span className="inline-flex items-center rounded-full border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--heading)]">
                {status}
              </span>
            </div>
            <p className="mt-1 truncate text-base font-bold text-[var(--heading)]">
              {snapshot.destination}
            </p>
            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
              {snapshot.planName}
            </p>
            <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--heading)]">
              {remaining}
            </p>
            {snapshot.expiryLabel ? (
              <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
                Expires {snapshot.expiryLabel}
              </p>
            ) : (
              <p className="mt-1 text-xs text-[var(--text-soft)]">
                {snapshot.fromCache
                  ? "Cached usage — tap for live refresh"
                  : "Tap to check live usage"}
              </p>
            )}
          </div>
          <ChevronRight
            className="mt-1 h-5 w-5 shrink-0 text-[var(--text-soft)]"
            aria-hidden="true"
          />
        </div>
      </Link>
    </section>
  );
}
