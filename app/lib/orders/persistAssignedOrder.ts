import "server-only";

import {
  OrderClaimStatus,
  OrderFundingSource,
  OrderStatus,
  Prisma,
} from "@prisma/client";
import { normalizeEmail } from "@/app/lib/auth/email";
import { captureIccidForProviderOrder } from "@/app/lib/orders/iccidCapture";
import type { VerifiedCheckoutOffer } from "@/app/lib/vesim/server";

/**
 * Persist a customer-linked order after confirmed provider success.
 * Supports COMPANY_FUNDED, CUSTOMER_WALLET, CUSTOMER_SPLIT, DIRECT_PAYMENT,
 * and PARTNER_BALANCE. Upserts on providerOrderId.
 * Never stores QR/LPA/access tokens. ICCID stored encrypted when present.
 */
export async function persistAssignedOrder(
  tx: Prisma.TransactionClient,
  options: {
    providerOrderId: string;
    customerUserId: string;
    customerEmail: string;
    verifiedOffer: VerifiedCheckoutOffer;
    fundingSource: OrderFundingSource;
    status?: OrderStatus;
    /** Raw ICCID when already extracted (preferred). */
    iccid?: string | null;
    /** Checkout/broker payload used to extract ICCID when needed. */
    checkoutPayload?: Record<string, unknown> | null;
  }
): Promise<{ id: string; providerOrderId: string }> {
  const providerOrderId = options.providerOrderId.trim();
  const customerEmail = normalizeEmail(options.customerEmail);
  const customerUserId = options.customerUserId.trim();

  if (!providerOrderId || !customerEmail || !customerUserId) {
    throw new Error("Assigned order persistence requires complete identifiers.");
  }

  if (
    options.fundingSource !== OrderFundingSource.COMPANY_FUNDED &&
    options.fundingSource !== OrderFundingSource.CUSTOMER_WALLET &&
    options.fundingSource !== OrderFundingSource.CUSTOMER_SPLIT &&
    options.fundingSource !== OrderFundingSource.DIRECT_PAYMENT &&
    options.fundingSource !== OrderFundingSource.PARTNER_BALANCE
  ) {
    throw new Error("Unsupported order funding source for this flow.");
  }

  const validity =
    options.verifiedOffer.durationDays != null
      ? `${options.verifiedOffer.durationDays} Days`
      : null;

  const now = new Date();

  const order = await tx.order.upsert({
    where: { providerOrderId },
    create: {
      providerOrderId,
      userId: customerUserId,
      customerEmail,
      offerId: options.verifiedOffer.offerId,
      destination:
        options.verifiedOffer.countryName ||
        options.verifiedOffer.countryCode ||
        null,
      planName: options.verifiedOffer.name,
      dataAllowance: options.verifiedOffer.dataFormatted || null,
      validity,
      providerAmount: options.verifiedOffer.providerPriceUSD,
      providerCurrency: options.verifiedOffer.currency || "USD",
      displayAmount: options.verifiedOffer.priceUSD,
      displayCurrency: options.verifiedOffer.currency || "USD",
      fundingSource: options.fundingSource,
      status: options.status || OrderStatus.COMPLETED,
      claimStatus: OrderClaimStatus.CLAIMED,
      claimedAt: now,
    },
    update: {
      userId: customerUserId,
      customerEmail,
      offerId: options.verifiedOffer.offerId,
      destination:
        options.verifiedOffer.countryName ||
        options.verifiedOffer.countryCode ||
        null,
      planName: options.verifiedOffer.name,
      dataAllowance: options.verifiedOffer.dataFormatted || null,
      validity,
      providerAmount: options.verifiedOffer.providerPriceUSD,
      providerCurrency: options.verifiedOffer.currency || "USD",
      displayAmount: options.verifiedOffer.priceUSD,
      displayCurrency: options.verifiedOffer.currency || "USD",
      fundingSource: options.fundingSource,
      status: options.status || OrderStatus.COMPLETED,
      claimStatus: OrderClaimStatus.CLAIMED,
      claimedAt: now,
    },
    select: {
      id: true,
      providerOrderId: true,
    },
  });

  // Same transaction when possible — never fails the order on ICCID issues.
  await captureIccidForProviderOrder(
    {
      providerOrderId: order.providerOrderId,
      iccid: options.iccid,
      checkoutPayload: options.checkoutPayload,
    },
    tx
  );

  return order;
}
