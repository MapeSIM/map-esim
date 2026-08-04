import { NextRequest, NextResponse } from "next/server";
import {
  extractOfficialActivationLinks,
  isOfficialAndroidActivationUrl,
} from "@/app/lib/email/activation";
import {
  authorizeCustomerOwnedOrderInstall,
  customerInstallNotFoundResponse,
  fetchBrokerOrderPayload,
} from "@/app/lib/orders/customerOrderInstall";
import { publicErrorMessage } from "@/app/lib/vesim/server";

/**
 * Session-authenticated Android activation redirect for a customer-owned order.
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
        return customerInstallNotFoundResponse();
      }
    }

    const { orderId } = await context.params;
    const authz = await authorizeCustomerOwnedOrderInstall(orderId);
    if (!authz.ok) return authz.response;

    const orderData = await fetchBrokerOrderPayload(
      authz.order.providerOrderId
    );
    if (!orderData) {
      return customerInstallNotFoundResponse();
    }

    const official = extractOfficialActivationLinks(orderData);
    const redirectUrl = official.androidActivationUrl?.trim() || "";
    if (!redirectUrl || !isOfficialAndroidActivationUrl(redirectUrl)) {
      return customerInstallNotFoundResponse();
    }

    return NextResponse.redirect(redirectUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
        Pragma: "no-cache",
      },
    });
  } catch (error: unknown) {
    console.error(
      "Customer Android install error:",
      error instanceof Error ? error.message : "unknown_error"
    );
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
          "Cache-Control": "private, no-store",
          Pragma: "no-cache",
        },
      }
    );
  }
}
