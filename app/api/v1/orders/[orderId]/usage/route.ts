import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import {
  getPartnerApiEsimUsageByIccid,
  getPartnerApiOrder,
} from "@/app/lib/partnerApi/partnerApiOrders";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/orders/[orderId]/usage
 * Resolves the order's ICCID then returns live usage (production).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  const { orderId } = await context.params;
  try {
    const order = await getPartnerApiOrder({
      actor: auth.actor,
      orderId,
    });
    if (!order?.iccid) {
      return partnerApiError(
        404,
        "Not found",
        "Order not found or ICCID is not available yet."
      );
    }
    const result = await getPartnerApiEsimUsageByIccid({
      actor: auth.actor,
      iccid: order.iccid,
    });
    if (!result.ok) {
      if (result.code === "RATE_LIMITED") {
        return partnerApiError(429, result.error, undefined, {
          "Retry-After": String(result.retryAfterSec ?? 30),
        });
      }
      const status = result.code === "NOT_FOUND" ? 404 : 503;
      return partnerApiError(status, result.error);
    }
    return partnerApiJson({
      success: true,
      environment: "production",
      orderId: result.orderId,
      iccid: order.iccid,
      usage: result.usage,
    });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Usage is temporarily unavailable."
    );
  }
}
