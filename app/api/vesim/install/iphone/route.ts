import { NextRequest, NextResponse } from "next/server";
import { resolveIphoneActivationRedirectUrl } from "@/app/lib/vesim/installActions";
import { authorizeOrderAccess } from "@/app/lib/vesim/orderAccess";
import {
  getBrokerToken,
  getVesimBaseUrl,
  publicErrorMessage,
  readJsonSafe,
} from "@/app/lib/vesim/server";

/**
 * Server-side iPhone eSIM activation redirect.
 * Requires a valid order access token. Redirects only when VeSIM supplied an
 * official Apple activation URL. Never invents a link from LPA.
 */
export async function GET(req: NextRequest) {
  try {
    for (const banned of [
      "lpa",
      "qrValue",
      "activationCode",
      "carddata",
      "smdp",
      "activationUrl",
    ]) {
      if (req.nextUrl.searchParams.has(banned)) {
        return NextResponse.json(
          { success: false, error: "Not found" },
          { status: 404 }
        );
      }
    }

    const auth = authorizeOrderAccess(req);
    if (!auth.ok) return auth.response;
    const { orderId } = auth;

    const token = await getBrokerToken();
    const baseUrl = getVesimBaseUrl();
    const orderResponse = await fetch(
      `${baseUrl}/api/broker/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `${token.tokenType} ${token.accessToken}`,
        },
        cache: "no-store",
      }
    );

    const orderData = await readJsonSafe(orderResponse);
    if (!orderResponse.ok) {
      console.error("iPhone install order fetch failed:", orderResponse.status);
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    const redirectUrl = resolveIphoneActivationRedirectUrl(orderData);
    if (!redirectUrl) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    return NextResponse.redirect(redirectUrl, 302);
  } catch (error: unknown) {
    console.error(
      "iPhone install redirect error:",
      error instanceof Error ? error.message : "unknown_error"
    );
    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(error, "Unable to start iPhone installation"),
      },
      { status: 500 }
    );
  }
}
