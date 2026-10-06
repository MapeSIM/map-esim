import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
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

/**
 * Deep-link confirm for a single Partner-priced offer.
 * Primary browse+buy lives at /partner/catalog — missing params redirect there.
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
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    if (offerId) params.set("offerId", offerId);
    const qs = params.toString();
    redirect(qs ? `/partner/catalog?${qs}` : "/partner/catalog");
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
  const [profile, wallet, simpaisaOperators] = await Promise.all([
    prisma.partnerProfile.findUnique({
      where: { id: actor.partnerId },
      select: { discountBps: true },
    }),
    prisma.partnerWalletAccount.findUnique({
      where: { partnerId: actor.partnerId },
      select: { balanceCents: true },
    }),
    getSimpaisaWalletOperatorConfig(),
  ]);
  const balanceCents = wallet?.balanceCents ?? 0;
  const offers = await listPartnerCatalogOffers(country, {
    discountBps: profile?.discountBps ?? 0,
    walletBalanceCents: balanceCents,
    splitPaymentEnabled,
  });
  const offer = offers.find((row) => row.offerId === offerId) ?? null;

  if (!offer) {
    redirect(`/partner/catalog?country=${encodeURIComponent(country)}`);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Confirm purchase</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Review your Partner price and wallet balance, then confirm.
        </p>
      </header>
      <PartnerStorefrontBuy
        offer={offer}
        destinationCode={country}
        balanceLabel={formatUsdCents(balanceCents)}
        balanceCents={balanceCents}
        splitPaymentEnabled={splitPaymentEnabled}
        paymentGatewayConfigured={isPaymentGatewayConfigured()}
        enabledSimpaisaOperatorIds={simpaisaOperators.enabledOperatorIds}
      />
    </div>
  );
}
