import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { getPartnerApiWallet } from "@/app/lib/partnerApi/partnerApiWallet";

export const dynamic = "force-dynamic";

/** GET /api/v1/partner/wallet */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 20;
  if (limitRaw && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
    return partnerApiError(
      400,
      "Validation error",
      "limit must be an integer between 1 and 50."
    );
  }

  try {
    const wallet = await getPartnerApiWallet({
      actor: auth.actor,
      limit,
    });
    return partnerApiJson({ success: true, wallet });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Wallet is temporarily unavailable."
    );
  }
}
