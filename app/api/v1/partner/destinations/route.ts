import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { listPartnerApiDestinations } from "@/app/lib/partnerApi/partnerApiCatalog";

export const dynamic = "force-dynamic";

/** GET /api/v1/partner/destinations */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  try {
    const destinations = await listPartnerApiDestinations({
      discountBps: auth.actor.discountBps,
    });
    return partnerApiJson({
      success: true,
      destinations,
      branding: {
        brandCompanyName: auth.actor.brandCompanyName,
        brandSupportEmail: auth.actor.brandSupportEmail,
        brandButtonBg: auth.actor.brandButtonBg,
        brandButtonText: auth.actor.brandButtonText,
      },
    });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Destinations are temporarily unavailable."
    );
  }
}
