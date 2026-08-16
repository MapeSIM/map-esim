import { NextRequest, NextResponse } from "next/server";
import {
  getPartnerEsimShareUsage,
  shareUsagePublicError,
} from "@/app/lib/partner/partnerEsimShareRead";
import { SHARE_PAGE_UNAVAILABLE_MESSAGE } from "@/app/lib/share/shareSurface";
import { PRIVATE_API_RESPONSE_HEADERS } from "@/app/lib/security/headers";

const NO_STORE = {
  ...PRIVATE_API_RESPONSE_HEADERS,
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function genericUnavailable(): NextResponse {
  return NextResponse.json(
    { success: false, error: SHARE_PAGE_UNAVAILABLE_MESSAGE },
    { status: 404, headers: NO_STORE }
  );
}

/**
 * Token-authorized read-only eSIM usage.
 * Provider order id / ICCID are resolved server-side from the share token.
 * Never accepts client-supplied ICCID, LPA, or provider order identifiers.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    for (const banned of [
      "iccid",
      "imei",
      "eid",
      "tac",
      "access",
      "lpa",
      "qrValue",
      "providerOrderId",
      "orderId",
    ]) {
      if (req.nextUrl.searchParams.has(banned)) {
        return genericUnavailable();
      }
    }

    let body: unknown = null;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => null);
    }
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const record = body as Record<string, unknown>;
      for (const banned of [
        "iccid",
        "providerOrderId",
        "orderId",
        "lpa",
        "qrValue",
      ]) {
        if (banned in record) {
          return genericUnavailable();
        }
      }
    }

    const { token } = await context.params;
    const result = await getPartnerEsimShareUsage(token);
    if (!result.ok) {
      const pub = shareUsagePublicError(result.code);
      const headers: Record<string, string> = { ...NO_STORE };
      if (result.code === "RATE_LIMITED" && result.retryAfterSec) {
        headers["Retry-After"] = String(result.retryAfterSec);
      }
      return NextResponse.json(
        { success: false, error: pub.message },
        { status: pub.status, headers }
      );
    }

    const u = result.usage;
    return NextResponse.json(
      {
        success: true,
        usage: {
          status: u.status,
          statusLabel: u.statusLabel,
          initialDataGB: u.initialDataGB,
          remainingDataGB: u.remainingDataGB,
          usedDataGB: u.usedDataGB,
          usagePercent: u.usagePercent,
          usagePercentForBar: u.usagePercentForBar,
          isUnlimited: u.isUnlimited,
          planUnlimited: u.planUnlimited,
          reportsDataAllowance: u.reportsDataAllowance,
          activatedAt: u.activatedAt,
          expiresAt: u.expiresAt,
          daysRemaining: u.daysRemaining,
          isActivated: u.isActivated,
          isExpired: u.isExpired,
        },
      },
      { status: 200, headers: NO_STORE }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Usage is temporarily unavailable. Please try again later.",
      },
      { status: 503, headers: NO_STORE }
    );
  }
}
