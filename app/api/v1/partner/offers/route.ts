import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { listPartnerApiOffers } from "@/app/lib/partnerApi/partnerApiCatalog";

export const dynamic = "force-dynamic";

/** GET /api/v1/partner/offers */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  const sp = req.nextUrl.searchParams;
  const page = Number(sp.get("page") ?? "1");
  const limit = Number(sp.get("limit") ?? "50");
  const country = sp.get("country");
  const region = sp.get("region");
  const search = sp.get("search");
  const fullCatalog =
    sp.get("fullCatalog") === "1" || sp.get("fullCatalog") === "true";

  if (!Number.isInteger(page) || page < 1) {
    return partnerApiError(400, "Validation error", "page must be a positive integer.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return partnerApiError(
      400,
      "Validation error",
      "limit must be an integer between 1 and 500."
    );
  }

  try {
    const result = await listPartnerApiOffers({
      discountBps: auth.actor.discountBps,
      page,
      limit,
      country,
      region,
      search,
      fullCatalog,
    });
    return partnerApiJson({
      success: true,
      ...result,
    });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Offers are temporarily unavailable."
    );
  }
}
