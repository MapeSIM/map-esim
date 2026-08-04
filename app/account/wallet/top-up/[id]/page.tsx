import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { getCustomerTopupView } from "@/app/lib/wallet/topupRead";
import { browserReturnMustNotCreditWallet } from "@/app/lib/wallet/topupConstants";
import WalletTopupCheckoutButton from "@/app/components/account/WalletTopupCheckoutButton";

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

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/account/wallet/top-up"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to add funds
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          {view.isCredited
            ? "Top-up credited"
            : view.isReconciliation
              ? "Top-up under review"
              : view.isFailedOrExpired
                ? "Top-up not completed"
                : "Top-up status"}
        </h1>
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
        <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            PKR payment
          </dt>
          <dd className="font-semibold text-[var(--heading)]">{view.chargeNotice}</dd>
        </div>
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
          <p>
            Your wallet was credited after a verified payment confirmation.
            {view.walletCreditedAtLabel
              ? ` Credited at ${view.walletCreditedAtLabel}.`
              : ""}
          </p>
          <Link
            href="/account/wallet"
            className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]"
          >
            View wallet
          </Link>
        </div>
      ) : null}

      {view.isPending && !view.isCredited ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Secure checkout will confirm the PKR amount when a payment provider
            is available. You cannot mark this payment successful yourself.
          </p>
          <WalletTopupCheckoutButton
            topupId={view.topupId}
            enabled={view.canAttemptCheckout}
          />
        </div>
      ) : null}

      {view.isFailedOrExpired ? (
        <Link
          href="/account/wallet/top-up"
          className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] px-5 text-sm font-semibold text-[var(--heading)]"
        >
          Start a new top-up
        </Link>
      ) : null}
    </div>
  );
}
