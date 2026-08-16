import { NextRequest, NextResponse } from "next/server";
import {
  PARTNER_INSTALL_UNAVAILABLE_MESSAGE,
  authorizePartnerOwnedOrderInstallFromSession,
  loadPartnerOrderInstallForAuthorized,
  partnerInstallNotFoundResponse,
} from "@/app/lib/partner/partnerOrderInstall";
import { publicErrorMessage } from "@/app/lib/vesim/server";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

/**
 * Explicit Partner action: load install capability + manual details.
 * Ownership verified server-side. Never returns full ICCID or raw payload.
 * Never logs SM-DP+, activation code, LPA, or QR values.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    for (const banned of [
      "lpa",
      "qrValue",
      "activationCode",
      "carddata",
      "smdp",
      "access",
      "token",
      "iccid",
    ]) {
      if (req.nextUrl.searchParams.has(banned)) {
        return partnerInstallNotFoundResponse();
      }
    }

    const { orderId } = await context.params;
    const authz = await authorizePartnerOwnedOrderInstallFromSession(orderId);
    if (!authz.ok) return authz.response;

    const result = await loadPartnerOrderInstallForAuthorized(authz.order);

    if (!result.ok) {
      if (result.code === "NOT_FOUND") {
        return partnerInstallNotFoundResponse();
      }
      if (result.code === "UNAVAILABLE") {
        return NextResponse.json(
          {
            success: false,
            error: "Installation details are temporarily unavailable.",
          },
          { status: 503, headers: NO_STORE }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: PARTNER_INSTALL_UNAVAILABLE_MESSAGE,
        },
        { status: 404, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      {
        success: true,
        ...result.dto,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error: unknown) {
    console.error("Partner install-details route error");
    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(
          error,
          "Unable to load installation details"
        ),
      },
      { status: 500, headers: NO_STORE }
    );
  }
}
