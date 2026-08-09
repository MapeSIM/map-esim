import { prisma } from "@/app/lib/db";
import { normalizeEmail } from "@/app/lib/auth/email";
import { captureIccidForProviderOrder } from "@/app/lib/orders/iccidCapture";
import type { VerifiedCheckoutOffer } from "@/app/lib/vesim/server";

/**
 * Best-effort persistence after a successful VeSIM guest checkout.
 * Never throws to the checkout caller. Never auto-links by email on signup.
 */
export async function persistGuestOrder(options: {
  providerOrderId: string;
  customerEmail: string;
  verifiedOffer: VerifiedCheckoutOffer;
  status?: "PENDING" | "COMPLETED" | "FAILED";
  displayAmount?: number | null;
  displayCurrency?: string | null;
  iccid?: string | null;
  checkoutPayload?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const providerOrderId = options.providerOrderId.trim();
    const customerEmail = normalizeEmail(options.customerEmail);
    if (!providerOrderId || !customerEmail) return;

    const validity =
      options.verifiedOffer.durationDays != null
        ? `${options.verifiedOffer.durationDays} Days`
        : null;

    await prisma.order.upsert({
      where: { providerOrderId },
      create: {
        providerOrderId,
        userId: null,
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
        displayAmount: options.displayAmount ?? options.verifiedOffer.priceUSD,
        displayCurrency:
          options.displayCurrency || options.verifiedOffer.currency || "USD",
        status: options.status || "COMPLETED",
        claimStatus: "UNCLAIMED",
      },
      update: {
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
        displayAmount: options.displayAmount ?? options.verifiedOffer.priceUSD,
        displayCurrency:
          options.displayCurrency || options.verifiedOffer.currency || "USD",
        status: options.status || "COMPLETED",
      },
    });

    await captureIccidForProviderOrder({
      providerOrderId,
      iccid: options.iccid,
      checkoutPayload: options.checkoutPayload,
    });
  } catch {
    console.error("Guest order persistence failed");
  }
}
