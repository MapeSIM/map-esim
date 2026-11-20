import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { getPartnerApiOffer } from "@/app/lib/partnerApi/partnerApiCatalog";

export const dynamic = "force-dynamic";

/** GET /api/v1/partner/offers/[offerId] */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ offerId: string }> }
) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  const { offerId } = await context.params;
  const countryHint = req.nextUrl.searchParams.get("country");

  try {
    const offer = await getPartnerApiOffer({
      offerId,
      discountBps: auth.actor.discountBps,
      countryHint,
    });
    if (!offer) {
      return partnerApiError(404, "Not found", "Offer not found.");
    }
    return partnerApiJson({ success: true, offer });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Offer lookup is temporarily unavailable."
    );
  }
}
