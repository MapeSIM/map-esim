import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { getCustomerTopupView } from "@/app/lib/wallet/topupRead";
import { browserReturnMustNotCreditWallet } from "@/app/lib/wallet/topupConstants";
import WalletTopupCheckoutButton from "@/app/components/account/WalletTopupCheckoutButton";
import WalletTopupPendingPoller from "@/app/components/account/WalletTopupPendingPoller";

export const dynamic = "force-dynamic";

/**
 * Ownership-scoped top-up status page.
 * Refresh and browser return URLs are read-only and never credit the wallet.
 */
export default async function AccountWalletTopUpDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("CUSTOMER");
  const { id } = await params;
  const query = await searchParams;

  // Explicitly ignore any client-supplied payment outcome.
  void query.paid;
  void query.status;
  void query.amount;
  void query.gatewayStatus;
  void query.payment_status;
  browserReturnMustNotCreditWallet();

  const view = await getCustomerTopupView(user.id, id);

  const pageTitle = view.isCredited
    ? "Payment successful"
    : view.awaitingWalletApproval
      ? "Awaiting wallet approval"
      : view.isReconciliation
        ? "Top-up under review"
        : view.isFailedOrExpired
          ? "Top-up not completed"
          : "Top-up status";

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/account/wallet"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to wallet dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{pageTitle}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Values are loaded from your account records. Refreshing this page does
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
            Wallet credit
          </dt>
          <dd className="font-semibold text-[var(--heading)]">
            {view.creditAmountLabel} USD
          </dd>
        </div>
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Current wallet balance
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
            data-topup-state="credited"
          >
            <p className="font-semibold">Payment successful</p>
            <p className="mt-1">
              Your wallet was credited
              {view.creditAmountLabel
                ? ` with ${view.creditAmountLabel} USD`
                : ""}
              .
              {view.walletCreditedAtLabel
                ? ` Credited at ${view.walletCreditedAtLabel}.`
                : ""}
            </p>
            <p className="mt-2 font-semibold">
              Updated wallet balance: {view.balanceLabel} USD
            </p>
          </div>
          <Link
            href="/account/wallet?notice=credited"
            className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]"
          >
            View wallet
          </Link>
        </div>
      ) : null}

      {view.awaitingWalletApproval ? (
        <div className="space-y-4" data-topup-state="awaiting-wallet-approval">
          <WalletTopupPendingPoller enabled />
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
          </div>
          <Link
            href="/account/wallet?notice=pending"
            className="inline-flex h-10 items-center justify-center text-sm font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
          >
            Back to wallet dashboard
          </Link>
        </div>
      ) : null}

      {view.isPending &&
      !view.isCredited &&
      !view.awaitingWalletApproval ? (
        <div className="space-y-4" data-topup-state="checkout-ready">
          <div
            className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]"
            role="status"
          >
            Choose your mobile wallet and continue to send a payment request.
            You cannot mark this payment successful yourself.
          </div>
          <WalletTopupCheckoutButton
            topupId={view.topupId}
            enabled={view.canAttemptCheckout}
            simpaisaWalletCheckout={view.simpaisaWalletCheckout}
            usdCents={view.creditAmountCents}
          />
          <Link
            href="/account/wallet?notice=pending"
            className="inline-flex h-10 items-center justify-center text-sm font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
          >
            Back to wallet dashboard
          </Link>
        </div>
      ) : null}

      {view.isFailedOrExpired ? (
        <div
          className="flex flex-wrap gap-3"
          data-topup-state="failed-or-expired"
        >
          <Link
            href="/account/wallet/top-up"
            className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]"
            data-topup-action="retry-payment"
          >
            Retry payment
          </Link>
          <Link
            href="/account/wallet?notice=failed"
            className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] px-5 text-sm font-semibold text-[var(--heading)]"
          >
            View wallet
          </Link>
        </div>
      ) : null}
    </div>
  );
}
