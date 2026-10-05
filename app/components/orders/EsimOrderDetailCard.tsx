"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Plus,
  QrCode,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";
import type { ProviderLifecycleCacheView } from "@/app/lib/orders/providerLifecycleShared";
import {
  composeEsimStatusBadgeText,
  dataUsageTone,
  daysLeftBadgeLabel,
  daysLeftFromExpiresAt,
  formatOrderDetailGb,
  formatOrderDetailWhen,
  lifecycleToUsageView,
  remainingPercent,
  resolveIsUnlimitedPlan,
  type EsimOrderDetailUsageView,
} from "@/app/lib/orders/esimOrderDetailDisplay";

export type EsimOrderDetailCardProps = {
  orderId: string;
  /** Visual chrome: inline card (default) or modal shell with X. */
  variant?: "card" | "modal";
  onClose?: () => void;
  title?: string;

  dataPlan: string;
  validityPeriod: string;
  amountPaid: string;
  purchasedAt: string;
  /** Catalog data string — used to detect Unlimited plans before live sync. */
  dataAllowance?: string | null;

  orderStatusLabel?: string | null;
  isRefunded: boolean;
  refundedAtLabel?: string | null;

  /** Cron-synced cache — shown immediately without requiring Update. */
  lifecycle?: ProviderLifecycleCacheView | null;

  /** On-demand carrier sync path. Null hides the Update button. */
  usagePath?: string | null;
  usageEligible?: boolean;
  /** Deep-link / partner: fetch once on mount when eligible. */
  autoRefresh?: boolean;

  viewQrHref?: string | null;
  onViewQr?: () => void;
  /** When true, shows Share QR (uses shareUrl or the current page URL). */
  enableShare?: boolean;
  shareUrl?: string | null;
  shareTitle?: string | null;
  qrDownloadHref?: string | null;
  addDataHref?: string | null;
  raiseIssueHref?: string | null;
  /** Admin/partner conditional refund control (button or form trigger). */
  refundAction?: ReactNode;
  /** Extra footer content (e.g. ICCID, admin-only notes). */
  footer?: ReactNode;
  /** Hide the action button bar entirely. */
  hideActions?: boolean;
};

function statusBadgeClass(label: string, isRefunded: boolean): string {
  if (isRefunded || /refund/i.test(label)) {
    return "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]";
  }
  if (/expir/i.test(label)) {
    return "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]";
  }
  if (/deplet|exhausted|no data/i.test(label)) {
    return "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]";
  }
  if (/active/i.test(label)) {
    return "border-emerald-500/45 bg-emerald-500/15 text-emerald-100";
  }
  return "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--heading)]";
}

function progressBarClass(
  tone: ReturnType<typeof dataUsageTone>
): string {
  switch (tone) {
    case "depleted":
      return "bg-[var(--danger-text)]";
    case "low":
      return "bg-amber-400";
    case "healthy":
      return "bg-emerald-400";
    default:
      return "bg-[var(--accent-strong)]";
  }
}

function mapLiveUsage(
  raw: Record<string, unknown>,
  hints?: { dataAllowance?: string | null; dataPlan?: string | null }
): EsimOrderDetailUsageView {
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const bool = (v: unknown): boolean | null =>
    typeof v === "boolean" ? v : null;

  const initialDataGB = num(raw.initialDataGB);
  const remainingDataGB = num(raw.remainingDataGB);
  const isUnlimited = resolveIsUnlimitedPlan({
    isUnlimited: Boolean(raw.isUnlimited || raw.planUnlimited),
    dataAllowance: hints?.dataAllowance,
    dataPlan: hints?.dataPlan,
    initialDataGB,
    remainingDataGB,
    reportsDataAllowance:
      raw.reportsDataAllowance === false ? false : true,
  });
  return {
    statusLabel: String(raw.statusLabel || raw.status || "Unknown"),
    initialDataGB: isUnlimited ? null : initialDataGB,
    remainingDataGB: isUnlimited ? null : remainingDataGB,
    usedDataGB: isUnlimited ? null : num(raw.usedDataGB),
    usagePercent: isUnlimited ? null : num(raw.usagePercent),
    isUnlimited,
    reportsDataAllowance: !isUnlimited && raw.reportsDataAllowance !== false,
    activatedAt: str(raw.activatedAt),
    expiresAt: str(raw.expiresAt),
    daysRemaining: num(raw.daysRemaining),
    isExpired: bool(raw.isExpired),
  };
}

export default function EsimOrderDetailCard({
  orderId,
  variant = "card",
  onClose,
  title = "Order details",
  dataPlan,
  validityPeriod,
  amountPaid,
  purchasedAt,
  dataAllowance = null,
  orderStatusLabel = null,
  isRefunded,
  refundedAtLabel = null,
  lifecycle = null,
  usagePath = null,
  usageEligible = true,
  autoRefresh = false,
  viewQrHref = null,
  onViewQr,
  enableShare = false,
  shareUrl = null,
  shareTitle = null,
  qrDownloadHref = null,
  addDataHref = null,
  raiseIssueHref = null,
  refundAction = null,
  footer = null,
  hideActions = false,
}: EsimOrderDetailCardProps) {
  const router = useRouter();
  const headingId = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveUsage, setLiveUsage] = useState<EsimOrderDetailUsageView | null>(
    null
  );
  const [shareCopied, setShareCopied] = useState(false);

  const cachedUsage = useMemo(
    () => lifecycleToUsageView(lifecycle, dataAllowance, dataPlan),
    [lifecycle, dataAllowance, dataPlan]
  );
  const usage = liveUsage ?? cachedUsage;

  const unlimited = resolveIsUnlimitedPlan({
    isUnlimited: usage?.isUnlimited,
    dataAllowance,
    dataPlan,
    initialDataGB: usage?.initialDataGB,
    remainingDataGB: usage?.remainingDataGB,
    reportsDataAllowance: usage?.reportsDataAllowance,
  });

  const statusText = composeEsimStatusBadgeText({
    isRefunded,
    orderStatusLabel,
    lifecycle,
    usage: usage
      ? { ...usage, isUnlimited: unlimited }
      : null,
    dataAllowance,
    dataPlan,
  });

  const remPct =
    !unlimited && usage
      ? remainingPercent(usage.remainingDataGB, usage.initialDataGB)
      : null;
  const tone =
    !unlimited && usage
      ? dataUsageTone(remPct, usage.remainingDataGB)
      : "unknown";
  const usedPct =
    unlimited || !usage
      ? null
      : usage.usagePercent != null && Number.isFinite(usage.usagePercent)
        ? Math.min(100, Math.max(0, usage.usagePercent))
        : remPct != null
          ? Math.min(100, Math.max(0, 100 - remPct))
          : null;

  const daysLeft =
    usage?.daysRemaining ??
    daysLeftFromExpiresAt(usage?.expiresAt ?? lifecycle?.expiresAtIso ?? null);
  const daysBadge = daysLeftBadgeLabel(daysLeft);

  const canUpdate = Boolean(usagePath) && usageEligible && !isRefunded;

  const loadUsage = useCallback(async () => {
    if (!usagePath || !canUpdate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(usagePath, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        usage?: Record<string, unknown>;
      } | null;
      if (!res.ok || !json?.success || !json.usage) {
        setError(
          json?.error ||
            "Live usage is temporarily unavailable. Please try again later."
        );
        return;
      }
      setLiveUsage(
        mapLiveUsage(json.usage, {
          dataAllowance,
          dataPlan,
        })
      );
      router.refresh();
    } catch {
      setError("Live usage is temporarily unavailable. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [usagePath, canUpdate, router, dataAllowance, dataPlan]);

  useEffect(() => {
    if (!autoRefresh || !canUpdate || liveUsage || loading) return;
    void loadUsage();
    // Intentionally once when deep-linked / partner opens usage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, canUpdate]);

  async function onShare() {
    if (typeof window === "undefined") return;
    const raw = (shareUrl ?? "").trim();
    const url = raw
      ? raw.startsWith("http://") || raw.startsWith("https://")
        ? raw
        : new URL(raw, window.location.origin).href
      : window.location.href;
    const titleText = (shareTitle ?? dataPlan ?? "MAP eSIM").trim();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: titleText, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 2000);
      } catch {
        setShareCopied(false);
      }
    }
  }

  const showViewQr = Boolean(onViewQr || viewQrHref) && !isRefunded;
  const showShare = (enableShare || Boolean(shareUrl) || variant === "modal") && !isRefunded;
  const showDownload = Boolean(qrDownloadHref) && !isRefunded;
  const showAddData = Boolean(addDataHref) && !isRefunded;
  const showRaiseIssue = Boolean(raiseIssueHref);
  const showActionBar =
    !hideActions &&
    (showViewQr ||
      showShare ||
      showDownload ||
      showAddData ||
      showRaiseIssue ||
      Boolean(refundAction));

  const shellClass =
    variant === "modal"
      ? "relative mx-auto flex max-h-[min(92vh,880px)] w-full max-w-lg flex-col overflow-hidden rounded-[24px] border border-[var(--border-strong)] bg-[#12161c] shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
      : "overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_14px_36px_rgba(0,0,0,0.22)]";

  return (
    <section
      aria-labelledby={headingId}
      className={shellClass}
      data-order-id={orderId}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/8 bg-[#0e1218] px-4 py-3.5 sm:px-5">
        <h2
          id={headingId}
          className="text-base font-bold tracking-tight text-white sm:text-lg"
        >
          {title}
        </h2>
        {variant === "modal" && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
            aria-label="Close order details"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {isRefunded ? (
          <div
            className="rounded-2xl border border-red-500/40 bg-red-500/15 px-4 py-3.5"
            role="alert"
          >
            <p className="text-sm font-bold text-red-100">
              Order Refunded: This order has been refunded. The eSIM QR code is
              no longer valid and cannot be activated.
            </p>
            {refundedAtLabel ? (
              <p className="mt-2 text-xs font-medium text-red-200/90">
                Refunded on: {refundedAtLabel}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">
              eSIM Status
            </p>
            <span
              className={`mt-1.5 inline-flex max-w-full rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${statusBadgeClass(statusText, isRefunded)}`}
            >
              {statusText}
            </span>
          </div>
          {canUpdate ? (
            <button
              type="button"
              onClick={() => void loadUsage()}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3.5 text-sm font-semibold text-white transition hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {loading ? "Updating…" : "Update"}
            </button>
          ) : null}
        </div>

        {error ? (
          <p
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/70"
            role="status"
          >
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-white/10 bg-[#1a2029] px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">
              Activated
            </p>
            <p className="mt-1.5 text-sm font-semibold text-white">
              {formatOrderDetailWhen(
                usage?.activatedAt ?? lifecycle?.activatedAtIso ?? null
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#1a2029] px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">
              Expires
            </p>
            <p className="mt-1.5 text-sm font-semibold text-white">
              {formatOrderDetailWhen(
                usage?.expiresAt ?? lifecycle?.expiresAtIso ?? null
              )}
            </p>
            {daysBadge && !isRefunded ? (
              <span className="mt-2 inline-flex rounded-full border border-emerald-400/35 bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-200">
                {daysBadge}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#1a2029] px-3.5 py-3.5">
          {unlimited ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Data</p>
              <span className="inline-flex items-center rounded-full border border-teal-400/40 bg-teal-400/15 px-2.5 py-0.5 text-xs font-bold text-teal-200">
                ∞ Unlimited
              </span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <p className="text-sm font-semibold text-white">Data Usage</p>
                <p className="text-sm font-bold tabular-nums text-white">
                  {formatOrderDetailGb(usage?.remainingDataGB ?? null, {
                    unit: "auto",
                  })}{" "}
                  <span className="font-medium text-white/55">left</span>
                </p>
              </div>
              {usedPct != null ? (
                <div
                  className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(usedPct)}
                  aria-label="Data usage"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${progressBarClass(tone)}`}
                    style={{ width: `${Math.max(usedPct, tone === "depleted" ? 100 : usedPct)}%` }}
                  />
                </div>
              ) : (
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10" />
              )}
              <p className="mt-2 text-xs text-white/55">
                {formatOrderDetailGb(usage?.usedDataGB ?? null)} used of{" "}
                {formatOrderDetailGb(usage?.initialDataGB ?? null)}
              </p>
            </>
          )}
          {lifecycle?.syncedAtLabel && !liveUsage ? (
            <p className="mt-2 text-[11px] text-white/40">
              Cached · last sync {lifecycle.syncedAtLabel}
            </p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
              Data Plan
            </dt>
            <dd className="mt-1 text-sm font-semibold text-white break-words">
              {dataPlan}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
              Validity Period
            </dt>
            <dd className="mt-1 text-sm font-semibold text-white break-words">
              {validityPeriod}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
              Amount Paid
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-white">
              {amountPaid}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
              Purchased
            </dt>
            <dd className="mt-1 text-sm font-semibold text-white break-words">
              {purchasedAt}
            </dd>
          </div>
        </dl>

        {showActionBar ? (
          <div className="space-y-2.5 border-t border-white/8 pt-4">
            <div className="grid min-w-0 gap-2 sm:grid-cols-3">
              {showViewQr ? (
                onViewQr ? (
                  <button
                    type="button"
                    onClick={onViewQr}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-semibold text-white transition hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                  >
                    <QrCode className="h-4 w-4 shrink-0" aria-hidden="true" />
                    View QR Code
                  </button>
                ) : (
                  <Link
                    href={viewQrHref!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-semibold text-white transition hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                  >
                    <QrCode className="h-4 w-4 shrink-0" aria-hidden="true" />
                    View QR Code
                  </Link>
                )
              ) : null}
              {showShare ? (
                <button
                  type="button"
                  onClick={() => void onShare()}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-semibold text-white transition hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                >
                  <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {shareCopied ? "Link copied" : "Share QR"}
                </button>
              ) : null}
              {showDownload ? (
                <a
                  href={qrDownloadHref!}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 text-sm font-semibold text-white transition hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Download QR
                </a>
              ) : null}
            </div>

            {showAddData ? (
              <Link
                href={addDataHref!}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-bold text-[#062016] shadow-[0_10px_24px_rgba(16,185,129,0.28)] transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add data to this eSIM
              </Link>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {showRaiseIssue ? (
                <Link
                  href={raiseIssueHref!}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 bg-transparent px-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                >
                  Raise issue
                </Link>
              ) : null}
              {refundAction}
            </div>
          </div>
        ) : null}

        {footer}
      </div>
    </section>
  );
}
