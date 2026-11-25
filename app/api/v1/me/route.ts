import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { getPartnerApiWallet } from "@/app/lib/partnerApi/partnerApiWallet";

export const dynamic = "force-dynamic";

/** GET /api/v1/me — verify API key, partner identity, production env, wallet. */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  try {
    const wallet = await getPartnerApiWallet({
      actor: auth.actor,
      limit: 5,
    });
    return partnerApiJson({
      success: true,
      environment: "production",
      partner: {
        id: auth.actor.partnerId,
        name: auth.actor.name,
        email: auth.actor.email,
        brandCompanyName: auth.actor.brandCompanyName,
      },
      wallet: {
        balanceCents: wallet.balanceCents,
        balanceUsd: wallet.balanceUsd,
        balanceLabel: wallet.balanceLabel,
        currency: wallet.currency,
      },
    });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Account is temporarily unavailable."
    );
  }
}
