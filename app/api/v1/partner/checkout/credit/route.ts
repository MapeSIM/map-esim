import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { creditPartnerApiCheckout } from "@/app/lib/partnerApi/partnerApiCheckout";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/v1/partner/checkout/credit */
export async function POST(req: NextRequest) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return partnerApiError(400, "Validation error", "Invalid JSON body.");
  }

  // Never trust client money fields.
  void body.amount;
  void body.amountCents;
  void body.price;
  void body.total;
  void body.discount;

  const headerKey =
    req.headers.get("idempotency-key") ??
    req.headers.get("Idempotency-Key");
  const idempotencyKey = headerKey || body.idempotencyKey;

  try {
    const result = await creditPartnerApiCheckout({
      actor: auth.actor,
      offerId: body.offerId,
      quantity: body.quantity,
      idempotencyKey,
      countryHint: body.countryHint ?? body.country,
    });
    if (!result.ok) {
      if (result.code === "INSUFFICIENT_FUNDS") {
        return partnerApiError(402, "Insufficient funds", result.error);
      }
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "INVALID" ||
              result.code === "IDEMPOTENCY_REQUIRED"
            ? 400
            : 503;
      return partnerApiError(status, result.error);
    }
    return partnerApiJson({
      success: true,
      environment: "production",
      order: {
        orderId: result.orderId,
        purchaseId: result.purchaseId,
        offerId: result.offerId,
        amountCents: result.amountCents,
        amountLabel: result.amountLabel,
        remainingBalanceCents: result.remainingBalanceCents,
        remainingBalanceLabel: result.remainingBalanceLabel,
        iccid: result.iccid,
        lpa: result.lpa,
        qrUrl: result.qrUrl,
        qrCodeUrl: result.qrUrl,
        status: "COMPLETED",
        duplicate: result.duplicate,
      },
    });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Checkout is temporarily unavailable."
    );
  }
}
