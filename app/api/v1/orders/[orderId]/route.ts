import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { getPartnerApiOrder } from "@/app/lib/partnerApi/partnerApiOrders";
import { PARTNER_SITE_ORIGIN } from "@/app/lib/domain/appDomain";

export const dynamic = "force-dynamic";

/** GET /api/v1/orders/[orderId] — alias of GET /api/v1/partner/orders/[id] */
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
    if (!order) {
      return partnerApiError(404, "Not found", "Order not found.");
    }
    return partnerApiJson({
      success: true,
      environment: "production",
      order: {
        ...order,
        qrCodeUrl: order.qrUrl,
        shareUrl: `${PARTNER_SITE_ORIGIN}/partner/orders/${encodeURIComponent(order.orderId)}`,
      },
    });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Order lookup is temporarily unavailable."
    );
  }
}
