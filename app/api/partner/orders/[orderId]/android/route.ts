import { NextRequest, NextResponse } from "next/server";
import {
  extractOfficialActivationLinks,
  isOfficialAndroidActivationUrl,
} from "@/app/lib/email/activation";
import { fetchBrokerOrderPayload } from "@/app/lib/orders/customerOrderInstall";
import {
  authorizePartnerOwnedOrderInstallFromSession,
  partnerInstallNotFoundResponse,
} from "@/app/lib/partner/partnerOrderInstall";
import { publicErrorMessage } from "@/app/lib/vesim/server";

/**
 * Session-authenticated Android activation redirect for a Partner-owned order.
 * Keeps the raw provider activation URL out of page hrefs and the status bar.
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
      "activationUrl",
      "access",
      "token",
    ]) {
      if (req.nextUrl.searchParams.has(banned)) {
        return partnerInstallNotFoundResponse();
      }
    }

    const { orderId } = await context.params;
    const authz = await authorizePartnerOwnedOrderInstallFromSession(orderId);
    if (!authz.ok) return authz.response;

    const orderData = await fetchBrokerOrderPayload(authz.order.providerOrderId);
    if (!orderData) {
      return partnerInstallNotFoundResponse();
    }

    const official = extractOfficialActivationLinks(orderData);
    const redirectUrl = official.androidActivationUrl?.trim() || "";
    if (!redirectUrl || !isOfficialAndroidActivationUrl(redirectUrl)) {
      return partnerInstallNotFoundResponse();
    }

    return NextResponse.redirect(redirectUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      },
    });
  } catch (error: unknown) {
    console.error("Partner Android install error");
    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(
          error,
          "Unable to start Android installation"
        ),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
        },
      }
    );
  }
}
