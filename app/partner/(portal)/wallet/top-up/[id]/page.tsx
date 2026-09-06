import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { getPartnerTopupView } from "@/app/lib/partner/partnerWalletTopupRead";
import { browserReturnMustNotCreditPartnerWallet } from "@/app/lib/partner/partnerWalletTopupConstants";
import PartnerWalletTopupCheckoutButton from "@/app/components/partner/PartnerWalletTopupCheckoutButton";
import PartnerWalletTopupPendingPoller from "@/app/components/partner/PartnerWalletTopupPendingPoller";

export const dynamic = "force-dynamic";

/**
 * Ownership-scoped Partner Add Funds status page.
 * Refresh and browser return URLs are read-only and never credit the wallet.
 */
export default async function PartnerWalletTopUpDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("PARTNER");
  const { id } = await params;
  const query = await searchParams;

  void query.paid;
  void query.status;
  void query.amount;
  void query.gatewayStatus;
  void query.payment_status;
  browserReturnMustNotCreditPartnerWallet();

  const view = await getPartnerTopupView(user.id, id);

  const pageTitle = view.isCredited
    ? "Payment successful"
    : view.awaitingWalletApproval
      ? "Awaiting approval"
      : view.isReconciliation
        ? "Top-up under review"
        : view.isFailedOrExpired
          ? "Top-up not completed"
          : "Top-up status";

  return (
    <div className="min-w-0 w-full max-w-full space-y-8">
      <header>
        <Link
          href="/partner/wallet"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to Partner wallet
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{pageTitle}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Values are loaded from your Partner records. Refreshing this page does
          not process payment or change your balance.
        </p>
      </header>

      <dl className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 sm:px-5 text-sm">
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Status
          </dt>
          <dd className="font-semibold text-[var(--heading)]">{view.statusLabel}</dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Partner wallet credit
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {view.baseAmountLabel} USD
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Current Partner balance
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {view.balanceLabel} USD
          </dd>
        </div>
        {view.paymentMethodLabel ? (
          <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Payment method
            </dt>
            <dd className="font-semibold text-[var(--heading)]">
              {view.paymentMethodLabel}
            </dd>
          </div>
        ) : null}
        {view.pkrAmountLabel ? (
          <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              PKR amount
            </dt>
            <dd className="font-semibold text-[var(--heading)]">
              {view.pkrAmountLabel}
            </dd>
          </div>
        ) : (
          <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              PKR payment
            </dt>
            <dd className="font-semibold text-[var(--heading)]">
              {view.chargeNotice}
            </dd>
          </div>
        )}
        {view.customerMsisdnMasked ? (
          <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Mobile number
            </dt>
            <dd className="font-semibold text-[var(--heading)]">
              {view.customerMsisdnMasked}
            </dd>
          </div>
        ) : null}
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Gateway
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {view.gatewayStatusLabel}
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Created
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {view.createdAtLabel}
          </dd>
        </div>
      </dl>

      {view.failureMessage ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 text-sm text-[var(--heading)]"
          role="status"
        >
          {view.failureMessage}
        </div>
      ) : null}

      {view.isCredited ? (
        <div className="space-y-3 text-sm text-[var(--text-muted)]">
          <div
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
            role="status"
            data-partner-topup-state="credited"
          >
            <p className="font-semibold">Payment successful</p>
            <p className="mt-1">
              Your Partner wallet was credited
              {view.baseAmountLabel ? ` with ${view.baseAmountLabel} USD` : ""}.
              {view.walletCreditedAtLabel
                ? ` Credited at ${view.walletCreditedAtLabel}.`
                : ""}
            </p>
            <p className="mt-2 font-semibold">
              Updated Partner balance: {view.balanceLabel} USD
            </p>
          </div>
          <Link
            href="/partner/wallet"
            className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]"
          >
            View Partner wallet
          </Link>
        </div>
      ) : null}

      {view.awaitingWalletApproval ? (
        <div
          className="space-y-4"
          data-partner-topup-state="awaiting-wallet-approval"
        >
          <PartnerWalletTopupPendingPoller enabled />
          <div
            className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]"
            role="status"
          >
            <p className="font-semibold">
              Payment request sent to{" "}
              {view.paymentMethodLabel ?? "JazzCash/Easypaisa"}.
            </p>
            <p className="mt-1">
              Please approve the request in your wallet app. This page updates
              automatically when payment is confirmed. Do not submit another
              payment request for this top-up.
            </p>
            <p className="mt-2 font-semibold">Awaiting approval</p>
          </div>
          <Link
            href="/partner/wallet"
            className="inline-flex h-10 items-center justify-center text-sm font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
          >
            Back to Partner wallet
          </Link>
        </div>
      ) : null}

      {view.isPending &&
      !view.isCredited &&
      !view.awaitingWalletApproval ? (
        <div className="space-y-4" data-partner-topup-state="checkout-ready">
          <div
            className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]"
            role="status"
          >
            Choose your mobile wallet and continue to send a payment request.
            You cannot mark this payment successful yourself.
          </div>
          <PartnerWalletTopupCheckoutButton
            topupId={view.topupId}
            enabled={view.canAttemptCheckout}
            simpaisaWalletCheckout={view.simpaisaWalletCheckout}
            usdCents={view.totalPayableCents}
          />
          <Link
            href="/partner/wallet"
            className="inline-flex h-10 items-center justify-center text-sm font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
          >
            Back to Partner wallet
          </Link>
        </div>
      ) : null}

      {view.isFailedOrExpired || view.isReconciliation ? (
        <div
          className="flex flex-wrap gap-3"
          data-partner-topup-state="failed-or-expired"
        >
          <Link
            href="/partner/wallet"
            className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]"
          >
            Retry payment
          </Link>
          <Link
            href="/partner/wallet"
            className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] px-5 text-sm font-semibold text-[var(--heading)]"
          >
            Back to Partner wallet
          </Link>
        </div>
      ) : null}
    </div>
  );
}
