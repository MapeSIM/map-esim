import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import {
  getPartnerDiscountPercentLabel,
  requireActivePartnerActor,
} from "@/app/lib/partner/partnerAccess";
import { listPartnerCatalogOffers } from "@/app/lib/partner/partnerCatalogRead";
import { isPartnerEsimSplitPaymentEnabled } from "@/app/lib/partner/partnerEsimSplitPaymentPolicy";
import PartnerStorefrontBuy from "@/app/components/partner/PartnerStorefrontBuy";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";
import { getSimpaisaWalletOperatorConfig } from "@/app/lib/payments/simpaisaWalletOperatorConfig";
import {
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";
import { formatUsdCents } from "@/app/lib/wallet/display";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Deep-link confirm for a single Partner-priced offer.
 * Browse stays on /partner/countries; missing params return there.
 */
export default async function PartnerStorefrontBuyPage({
  searchParams,
}: {
  searchParams: Promise<{ offerId?: string; country?: string }>;
}) {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  const query = await searchParams;
  const offerId = normalizeOfferId(query.offerId);
  const country = sanitizeCountryHint(query.country);

  if (!offerId || !country) {
    redirect("/partner/countries");
  }

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

  const splitPaymentEnabled = isPartnerEsimSplitPaymentEnabled();
  const [profile, wallet, simpaisaOperators, discountPercentLabel] =
    await Promise.all([
      prisma.partnerProfile.findUnique({
        where: { id: actor.partnerId },
        select: { discountBps: true },
      }),
      prisma.partnerWalletAccount.findUnique({
        where: { partnerId: actor.partnerId },
        select: { balanceCents: true },
      }),
      getSimpaisaWalletOperatorConfig(),
      getPartnerDiscountPercentLabel(user.id),
    ]);
  const balanceCents = wallet?.balanceCents ?? 0;
  const offers = await listPartnerCatalogOffers(country, {
    discountBps: profile?.discountBps ?? 0,
    walletBalanceCents: balanceCents,
    splitPaymentEnabled,
  });
  const offer = offers.find((row) => row.offerId === offerId) ?? null;

  if (!offer) {
    redirect(
      country
        ? `/partner/countries?q=${encodeURIComponent(country)}`
        : "/partner/countries"
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Confirm purchase</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Review retail price, your partner discount, and the final amount due,
          then confirm with Partner balance or online payment.
        </p>
      </header>
      <PartnerStorefrontBuy
        offer={offer}
        destinationCode={country}
        balanceLabel={formatUsdCents(balanceCents)}
        balanceCents={balanceCents}
        discountPercentLabel={discountPercentLabel}
        splitPaymentEnabled={splitPaymentEnabled}
        paymentGatewayConfigured={isPaymentGatewayConfigured()}
        enabledSimpaisaOperatorIds={simpaisaOperators.enabledOperatorIds}
      />
    </div>
  );
}
