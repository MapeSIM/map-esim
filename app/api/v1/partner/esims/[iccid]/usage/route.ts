import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { getPartnerApiEsimUsageByIccid } from "@/app/lib/partnerApi/partnerApiOrders";

export const dynamic = "force-dynamic";

/** GET /api/v1/partner/esims/[iccid]/usage */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ iccid: string }> }
) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  const { iccid } = await context.params;
  try {
    const result = await getPartnerApiEsimUsageByIccid({
      actor: auth.actor,
      iccid,
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
      orderId: result.orderId,
      iccid,
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
