import Link from "next/link";
import WalletPurchaseSelectForm from "@/app/components/account/WalletPurchaseSelectForm";
import { requireRole } from "@/app/lib/auth/session";
import { listAdminAssignmentDestinations } from "@/app/lib/esim/adminPackageAssignmentRead";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";

export const dynamic = "force-dynamic";

export default async function AccountWalletBuyPage() {
  const user = await requireRole("CUSTOMER");

  let destinations: Awaited<
    ReturnType<typeof listAdminAssignmentDestinations>
  > = [];
  let balanceLabel = "$0.00";
  let hasWallet = false;
  let loadError = false;

  try {
    const wallet = await prisma.walletAccount.findUnique({
      where: { userId: user.id },
      select: { balanceCents: true },
    });
    hasWallet = Boolean(wallet);
    balanceLabel = formatUsdCents(wallet?.balanceCents ?? 0);
    destinations = await listAdminAssignmentDestinations();
  } catch {
    loadError = true;
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <Link
          href="/account/wallet"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to wallet
        </Link>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Wallet purchase is temporarily unavailable. Please try again shortly.
          </p>
        </div>
      </div>
    );
  }

  if (!hasWallet) {
    return (
      <div className="space-y-6">
        <Link
          href="/account/wallet"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Back to wallet
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Buy eSIM with wallet</h1>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            A wallet is required before purchasing with wallet funds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <Link
          href="/account/wallet"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to wallet
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Buy eSIM with wallet
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Choose a package. Your wallet is charged only after you confirm on the
          next step.
        </p>
      </div>

      <WalletPurchaseSelectForm
        destinations={destinations}
        balanceLabel={balanceLabel}
      />
    </div>
  );
}
