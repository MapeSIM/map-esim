import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { getPartnerApiOrder } from "@/app/lib/partnerApi/partnerApiOrders";

export const dynamic = "force-dynamic";

/** GET /api/v1/partner/orders/[id] */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  const { id } = await context.params;
  try {
    const order = await getPartnerApiOrder({
      actor: auth.actor,
      orderId: id,
    });
    if (!order) {
      return partnerApiError(404, "Not found", "Order not found.");
    }
    return partnerApiJson({ success: true, order });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Order lookup is temporarily unavailable."
    );
  }
}
