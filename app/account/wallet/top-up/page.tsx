import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { getCustomerWalletSummary } from "@/app/lib/wallet/read";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";
import WalletTopupForm from "@/app/components/account/WalletTopupForm";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Wallet top-up is temporarily unavailable. Please refresh shortly.";

export default async function AccountWalletTopUpPage() {
  const user = await requireRole("CUSTOMER");

  let summary: Awaited<ReturnType<typeof getCustomerWalletSummary>>;
  try {
    summary = await getCustomerWalletSummary(user.id);
  } catch {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Add funds</h1>
        </header>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">{UNAVAILABLE}</p>
        </div>
      </div>
    );
  }

  if (!summary?.hasWallet) {
    return (
      <div className="space-y-6">
        <header>
          <Link
            href="/account/wallet"
            className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
          >
            ← Back to wallet
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Add funds</h1>
        </header>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            A wallet is required before you can add funds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/account/wallet"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to wallet
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Add funds</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Choose how much USD credit to add to your MAP eSIM wallet.
        </p>
      </header>

      <WalletTopupForm
        balanceLabel={summary.balanceLabel}
        gatewayStatusLabel={
          isPaymentGatewayConfigured()
            ? "Payment provider ready"
            : "Payment provider setup in progress"
        }
      />
    </div>
  );
}
