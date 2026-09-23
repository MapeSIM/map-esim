import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import {
  getPartnerBalanceLabel,
  requireActivePartnerActor,
} from "@/app/lib/partner/partnerAccess";
import { listPartnerCatalogDestinations } from "@/app/lib/partner/partnerCatalogRead";
import PartnerCatalogBuy from "@/app/components/partner/PartnerCatalogBuy";
import { isPartnerEsimSplitPaymentEnabled } from "@/app/lib/partner/partnerEsimSplitPaymentPolicy";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";

export const dynamic = "force-dynamic";

const PORTAL_UNAVAILABLE =
  "Catalog is temporarily unavailable. Please refresh shortly.";

export default async function PartnerCatalogPage() {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);

  if (!actor) {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  let destinations: Awaited<
    ReturnType<typeof listPartnerCatalogDestinations>
  > = [];
  let balanceLabel = "$0.00";
  let balanceCents = 0;
  let loadError = false;

  try {
    const [dest, balance, wallet] = await Promise.all([
      listPartnerCatalogDestinations(),
      getPartnerBalanceLabel(user.id),
      prisma.partnerWalletAccount.findUnique({
        where: { partnerId: actor.partnerId },
        select: { balanceCents: true },
      }),
    ]);
    destinations = dest;
    balanceLabel = balance ?? "$0.00";
    balanceCents = wallet?.balanceCents ?? 0;
  } catch {
    loadError = true;
  }

  if (loadError) {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          {PORTAL_UNAVAILABLE}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Catalog</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Browse destinations and buy with your Partner balance. Prefer{" "}
          <Link
            href="/countries"
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
          >
            Destinations
          </Link>{" "}
          for the full plan-card experience. This page remains available as a
          direct Partner-balance purchase path.
        </p>
      </header>

      <PartnerCatalogBuy
        destinations={destinations}
        balanceLabel={balanceLabel}
        balanceCents={balanceCents}
        splitPaymentEnabled={isPartnerEsimSplitPaymentEnabled()}
        paymentGatewayConfigured={isPaymentGatewayConfigured()}
      />
    </div>
  );
}
