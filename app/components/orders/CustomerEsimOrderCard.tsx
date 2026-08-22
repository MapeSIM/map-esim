import Image from "next/image";
import Link from "next/link";
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
};

function statusBadgeClass(status: CustomerEsimStatusBadge): string {
  switch (status) {
    case "Completed":
      return "bg-[var(--accent)]/15 text-[var(--heading)] border-[var(--accent-strong)]/40";
    case "Processing":
      return "bg-[var(--surface)] text-[var(--text)] border-[var(--border-hover)]";
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

  return (
    <article className="min-w-0 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_12px_30px_rgba(0,0,0,0.2)] sm:p-6">
      <div className="flex min-w-0 flex-wrap items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)]">
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
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-[var(--heading)] break-words">
              {order.destination}
            </h2>
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(order.statusBadge)}`}
            >
              {customerEsimStatusLabel(order.statusBadge)}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-soft)]">
            Ref {order.shortReference}
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)] break-words">
            {order.planName}
            {order.dataAllowance !== "Not available"
              ? ` · ${order.dataAllowance}`
              : ""}
            {order.validity !== "Not available" ? ` · ${order.validity}` : ""}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">
            {customerEsimStatusHelp(order.statusBadge)}
          </p>
        </div>
        <p className="shrink-0 text-base font-bold tabular-nums text-[var(--heading)]">
          {order.amountLabel}
        </p>
      </div>

      <dl className="mt-4 grid gap-1 text-xs text-[var(--text-soft)] sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold">Purchased: </dt>
          <dd className="inline">{order.createdAtLabel}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">ICCID: </dt>
          <dd className="inline">{order.iccidMasked}</dd>
        </div>
        {order.emailDeliveryLabel ? (
          <div>
            <dt className="inline font-semibold">Email: </dt>
            <dd className="inline">{order.emailDeliveryLabel}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {ready ? (
          <Link
            href={`${href}#install`}
            className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
          >
            View QR Code & Details
          </Link>
        ) : (
          <Link
            href={href}
            className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
          >
            View details
          </Link>
        )}
        {ready ? (
          <>
            <Link
              href={href}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
            >
              View details
            </Link>
            <Link
              href={`${href}?usage=1`}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[var(--accent-strong)]/50 bg-[var(--accent-strong)]/10 px-4 text-sm font-bold text-[var(--heading)] transition hover:bg-[var(--accent-strong)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
            >
              View usage
            </Link>
          </>
        ) : null}
        {order.statusBadge === "Review needed" ||
        order.statusBadge === "Failed" ? (
          <Link
            href="/support"
            className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
          >
            Contact support
          </Link>
        ) : null}
      </div>

      <CustomerEsimInstallHelpLinks className="mt-4 text-sm text-[var(--text-muted)]" />
    </article>
  );
}
