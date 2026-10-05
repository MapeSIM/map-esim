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
import {
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

export const dynamic = "force-dynamic";

const PORTAL_UNAVAILABLE =
  "Catalog is temporarily unavailable. Please refresh shortly.";

/**
 * Unified Partner catalog: destination → Partner-priced plans → 1-click wallet buy.
 * Payment return/cancel routes under /partner/catalog/payment/* stay unchanged.
 */
export default async function PartnerCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; offerId?: string }>;
}) {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  const query = await searchParams;
  const initialCountry = sanitizeCountryHint(query.country) || null;
  const initialOfferId = normalizeOfferId(query.offerId) || null;

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
        <h1 className="text-2xl font-bold tracking-tight">Buy eSIM</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Browse destinations, see your Partner wholesale price, and purchase
          with Partner balance in one place.
        </p>
      </header>

      <PartnerCatalogBuy
        destinations={destinations}
        balanceLabel={balanceLabel}
        balanceCents={balanceCents}
        initialCountry={initialCountry}
        initialOfferId={initialOfferId}
        splitPaymentEnabled={isPartnerEsimSplitPaymentEnabled()}
        paymentGatewayConfigured={isPaymentGatewayConfigured()}
      />
    </div>
  );
}
