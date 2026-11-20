import { NextRequest } from "next/server";
import {
  CANCEL_REASON_CODES,
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { cancelPartnerApiOrder } from "@/app/lib/partnerApi/partnerApiCancel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/v1/partner/orders/[id]/cancel */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  const { id } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return partnerApiError(400, "Validation error", "Invalid JSON body.");
  }

  void body.amount;
  void body.amountCents;
  void body.refundAmount;

  try {
    const result = await cancelPartnerApiOrder({
      actor: auth.actor,
      orderId: id,
      reason: body.reason,
      notes: body.notes,
    });
    if (!result.ok) {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "INVALID" || result.code === "NOT_ELIGIBLE"
            ? 400
            : 503;
      return partnerApiError(status, result.error, undefined);
    }
    return partnerApiJson({
      success: true,
      cancellation: {
        orderId: result.orderId,
        purchaseId: result.purchaseId,
        reason: result.reason,
        refundedAmountCents: result.refundedAmountCents,
        refundedAmountLabel: result.refundedAmountLabel,
        remainingBalanceCents: result.remainingBalanceCents,
        remainingBalanceLabel: result.remainingBalanceLabel,
        idempotent: result.idempotent,
      },
      cancelReasonCodes: CANCEL_REASON_CODES,
    });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Cancellation is temporarily unavailable."
    );
  }
}
