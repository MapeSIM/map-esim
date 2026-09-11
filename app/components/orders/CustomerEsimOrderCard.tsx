import Image from "next/image";
import Link from "next/link";
import { AddDataPurchaseBadge } from "@/app/components/orders/AddDataPurchaseBadge";
import { CustomerEsimInstallHelpLinks } from "@/app/components/orders/CustomerEsimInstallHelpLinks";
import {
  customerEsimStatusHelp,
  customerEsimStatusLabel,
  type CustomerEsimStatusBadge,
} from "@/app/lib/orders/customerOrderDisplay";

export type CustomerEsimOrderCardOrder = {
  id: string;
  shortReference: string;
  destination: string;
  flagUrl: string | null;
  planName: string;
  dataAllowance: string;
  validity: string;
  statusBadge: CustomerEsimStatusBadge;
  amountLabel: string;
  createdAtLabel: string;
  iccidMasked: string;
  emailDeliveryLabel: string | null;
  /** Read-model gate — show Add More Data CTA only when true. */
  addDataEligible?: boolean;
  /** True when this order itself was created by an Add More Data top-up. */
  isAddDataPurchase?: boolean;
};

function statusBadgeClass(status: CustomerEsimStatusBadge): string {
  switch (status) {
    case "Completed":
      return "bg-[var(--accent-strong)]/18 text-[var(--heading)] border-[var(--accent-strong)]/45";
    case "Processing":
      return "bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-hover)]";
    case "Review needed":
      return "bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]";
    case "Refunded":
    case "Failed":
      return "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]";
    default:
      return "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]";
  }
}

export function CustomerEsimOrderCard({
  order,
}: {
  order: CustomerEsimOrderCardOrder;
}) {
  const ready = order.statusBadge === "Completed";
  const href = `/account/orders/${encodeURIComponent(order.id)}`;
  const addDataHref = order.addDataEligible
    ? `/account/orders/${encodeURIComponent(order.id)}/add-data`
    : null;
  const showData = order.dataAllowance !== "Not available";
  const showValidity = order.validity !== "Not available";

  return (
    <article className="min-w-0 overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_14px_36px_rgba(0,0,0,0.22)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/55 px-5 py-5 sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-sm">
            {order.flagUrl ? (
              <Image
                src={order.flagUrl}
                alt=""
                width={56}
                height={42}
                className="h-9 w-auto object-cover"
                unoptimized
              />
            ) : (
              <span className="text-xs font-bold text-[var(--text-soft)]">
                eSIM
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-[var(--heading)] break-words">
                {order.destination}
              </h2>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide ${statusBadgeClass(order.statusBadge)}`}
              >
                {customerEsimStatusLabel(order.statusBadge)}
              </span>
              <AddDataPurchaseBadge
                isAddDataPurchase={Boolean(order.isAddDataPurchase)}
              />
            </div>
            <p className="mt-1.5 text-xs font-medium text-[var(--text-soft)]">
              Ref {order.shortReference}
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--text-muted)] break-words">
              {order.planName}
            </p>
          </div>

          <p className="shrink-0 pt-0.5 text-right text-base font-bold tabular-nums text-[var(--heading)] sm:text-lg">
            {order.amountLabel}
          </p>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
        {(showData || showValidity) && (
          <div className="flex flex-wrap gap-2">
            {showData ? (
              <span className="inline-flex items-center rounded-xl border border-[var(--accent-strong)]/30 bg-[var(--accent-strong)]/10 px-3 py-1.5 text-sm font-bold text-[var(--heading)]">
                {order.dataAllowance}
              </span>
            ) : null}
            {showValidity ? (
              <span className="inline-flex items-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-sm font-semibold text-[var(--heading)]">
                {order.validity}
              </span>
            ) : null}
          </div>
        )}

        <p className="text-sm leading-relaxed text-[var(--text)]">
          {customerEsimStatusHelp(order.statusBadge)}
        </p>

        <dl className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--page-bg)]/40 p-3.5 sm:grid-cols-2 sm:p-4">
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              ICCID
            </dt>
            <dd className="mt-1 font-mono text-sm font-semibold tracking-wide text-[var(--heading)] break-all">
              {order.iccidMasked}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Purchased
            </dt>
            <dd className="mt-1 text-sm font-medium text-[var(--text)]">
              {order.createdAtLabel}
            </dd>
          </div>
          {order.emailDeliveryLabel ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                Email
              </dt>
              <dd className="mt-1 text-sm font-medium text-[var(--text)]">
                {order.emailDeliveryLabel}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          {ready ? (
            <Link
              href={`${href}#install`}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(0,0,0,0.18)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
            >
              View QR Code & Details
            </Link>
          ) : (
            <Link
              href={href}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(0,0,0,0.18)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
            >
              View details
            </Link>
          )}
          {ready ? (
            <>
              <Link
                href={href}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
              >
                View details
              </Link>
              <Link
                href={`${href}?usage=1`}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[var(--accent-strong)]/55 bg-[var(--accent-strong)]/12 px-4 text-sm font-bold text-[var(--heading)] transition hover:bg-[var(--accent-strong)]/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
              >
                View usage
              </Link>
            </>
          ) : null}
          {addDataHref ? (
            <Link
              href={addDataHref}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[var(--accent-strong)] bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(0,0,0,0.16)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
            >
              Add More Data
            </Link>
          ) : null}
          {order.statusBadge === "Review needed" ||
          order.statusBadge === "Failed" ? (
            <Link
              href="/support"
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
            >
              Contact support
            </Link>
          ) : null}
        </div>

        <CustomerEsimInstallHelpLinks className="text-sm text-[var(--text-muted)]" />
      </div>
    </article>
  );
}
