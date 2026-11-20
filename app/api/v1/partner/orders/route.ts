import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { listPartnerApiOrders } from "@/app/lib/partnerApi/partnerApiOrders";

export const dynamic = "force-dynamic";

/** GET /api/v1/partner/orders */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  const sp = req.nextUrl.searchParams;
  const page = Number(sp.get("page") ?? "1");
  const limit = Number(sp.get("limit") ?? "25");

  if (!Number.isInteger(page) || page < 1) {
    return partnerApiError(400, "Validation error", "page must be a positive integer.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return partnerApiError(
      400,
      "Validation error",
      "limit must be an integer between 1 and 100."
    );
  }

  try {
    const result = await listPartnerApiOrders({
      actor: auth.actor,
      page,
      limit,
    });
    return partnerApiJson({ success: true, ...result });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Orders are temporarily unavailable."
    );
  }
}
