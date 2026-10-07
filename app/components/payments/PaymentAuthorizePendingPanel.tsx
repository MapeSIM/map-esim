/**
 * Pending / preparing payment return panel with gateway authorize countdown.
 * Display-only — never funds, never Verify, never marks paid.
 */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import StatusRefreshPoller from "@/app/components/payments/StatusRefreshPoller";
import {
  PAYMENT_RETURN_CHECK_STATUS_LABEL,
  PAYMENT_RETURN_EXPIRED_GUIDANCE,
  PAYMENT_RETURN_EXPIRED_HEADLINE,
  PAYMENT_RETURN_TIME_REMAINING_PREFIX,
  PAYMENT_RETURN_TRY_AGAIN_LABEL,
  formatPaymentAuthorizeCountdown,
  paymentAuthorizeWindowSeconds,
} from "@/app/lib/payments/paymentReturnUxCopy";

type Props = {
  headline: string;
  guidance: string;
  refreshHref: string | null;
  secondaryHref: string;
  secondaryLabel: string;
  /** Checkout / retry destination when the authorize window expires. */
  tryAgainHref: string;
  walletOperatorLabel?: string | null;
  walletOperatorId?: string | null;
  /**
   * When true, show the operator authorize countdown and stop polling at 00:00.
   * Preparing (post-paid) screens keep soft refresh without an authorize timer.
   */
  showAuthorizeCountdown?: boolean;
};

export function PaymentAuthorizePendingPanel({
  headline,
  guidance,
  refreshHref,
  secondaryHref,
  secondaryLabel,
  tryAgainHref,
  walletOperatorLabel = null,
  walletOperatorId = null,
  showAuthorizeCountdown = true,
}: Props) {
  const windowSeconds = useMemo(
    () =>
      paymentAuthorizeWindowSeconds({
        walletOperatorId,
        walletOperatorLabel,
      }),
    [walletOperatorId, walletOperatorLabel]
  );

  const [remainingSec, setRemainingSec] = useState(windowSeconds);
  const [expired, setExpired] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(true);

  const stopPolling = useCallback(() => {
    setPollingEnabled(false);
  }, []);

  useEffect(() => {
    if (!showAuthorizeCountdown || expired) return;
    setRemainingSec(windowSeconds);
  }, [showAuthorizeCountdown, windowSeconds, expired]);

  useEffect(() => {
    if (!showAuthorizeCountdown || expired) return;

    const tick = window.setInterval(() => {
      setRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(tick);
  }, [showAuthorizeCountdown, expired, windowSeconds]);

  useEffect(() => {
    if (!showAuthorizeCountdown || expired) return;
    if (remainingSec > 0) return;
    setExpired(true);
    setPollingEnabled(false);
  }, [showAuthorizeCountdown, expired, remainingSec]);

  if (expired && showAuthorizeCountdown) {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8 sm:px-8 sm:py-10"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center text-center">
          <h1 className="text-xl font-bold tracking-tight text-[var(--heading)] sm:text-2xl">
            {PAYMENT_RETURN_EXPIRED_HEADLINE}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--text-muted)] sm:text-[15px]">
            {PAYMENT_RETURN_EXPIRED_GUIDANCE}
          </p>
          <div className="mt-7 flex w-full max-w-sm flex-col items-center gap-3">
            <PrimaryButtonLink href={tryAgainHref} onNavigate={stopPolling}>
              {PAYMENT_RETURN_TRY_AGAIN_LABEL}
            </PrimaryButtonLink>
            <LeaveLink href={secondaryHref} onLeave={stopPolling}>
              {secondaryLabel}
            </LeaveLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <StatusRefreshPoller enabled={pollingEnabled} />
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8 sm:px-8 sm:py-10"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center text-center">
          <span className="relative inline-flex h-14 w-14 items-center justify-center">
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-[var(--accent-strong)]/15 animate-pulse"
            />
            <Loader2
              className="relative h-8 w-8 animate-spin text-[var(--accent-strong)]"
              aria-hidden="true"
            />
            <span className="sr-only">Loading</span>
          </span>
          <h1 className="mt-5 text-xl font-bold tracking-tight text-[var(--heading)] sm:text-2xl">
            {headline}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--text-muted)] sm:text-[15px]">
            {guidance}
          </p>
          {showAuthorizeCountdown ? (
            <p
              className="mt-4 font-mono text-sm font-semibold tabular-nums text-[var(--heading)] sm:text-[15px]"
              data-payment-authorize-countdown
            >
              {PAYMENT_RETURN_TIME_REMAINING_PREFIX}{" "}
              {formatPaymentAuthorizeCountdown(remainingSec)}
            </p>
          ) : null}
          <div className="mt-7 flex w-full max-w-sm flex-col items-center gap-3">
            {refreshHref ? (
              <SecondaryButtonLink href={refreshHref}>
                {PAYMENT_RETURN_CHECK_STATUS_LABEL}
              </SecondaryButtonLink>
            ) : null}
            <LeaveLink href={secondaryHref} onLeave={stopPolling}>
              {secondaryLabel}
            </LeaveLink>
          </div>
        </div>
      </div>
    </>
  );
}

function PrimaryButtonLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={() => onNavigate?.()}
      className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] sm:w-auto"
    >
      {children}
    </a>
  );
}

function SecondaryButtonLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface)]/80 sm:w-auto"
    >
      {children}
    </Link>
  );
}

/**
 * Hard navigation leave link — stops polling then uses a full document load so
 * `router.refresh()` cannot cancel the transition (Next soft-nav race).
 */
function LeaveLink({
  href,
  children,
  onLeave,
}: {
  href: string;
  children: ReactNode;
  onLeave?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={() => onLeave?.()}
      className="text-sm font-medium text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--heading)] hover:underline"
    >
      {children}
    </a>
  );
}
