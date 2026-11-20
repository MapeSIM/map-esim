import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { quotePartnerApiCheckout } from "@/app/lib/partnerApi/partnerApiCheckout";

export const dynamic = "force-dynamic";

/** POST /api/v1/partner/checkout/quote */
export async function POST(req: NextRequest) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return partnerApiError(400, "Validation error", "Invalid JSON body.");
  }

  void body.amount;
  void body.amountCents;
  void body.price;
  void body.discount;

  try {
    const result = await quotePartnerApiCheckout({
      actor: auth.actor,
      offerId: body.offerId,
      quantity: body.quantity,
    });
    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404 : 400;
      return partnerApiError(status, result.error);
    }
    return partnerApiJson({
      success: true,
      quote: {
        offerId: result.offerId,
        quantity: result.quantity,
        unitPriceCents: result.unitPriceCents,
        unitPriceUsd: result.unitPriceUsd,
        unitPriceLabel: result.unitPriceLabel,
        totalPriceCents: result.totalPriceCents,
        totalPriceUsd: result.totalPriceUsd,
        totalPriceLabel: result.totalPriceLabel,
        currency: result.currency,
        walletBalanceCents: result.walletBalanceCents,
        walletBalanceLabel: result.walletBalanceLabel,
        sufficientBalance: result.sufficientBalance,
      },
    });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Quote is temporarily unavailable."
    );
  }
}
