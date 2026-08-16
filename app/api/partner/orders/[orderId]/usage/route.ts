import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { customerUsagePublicError } from "@/app/lib/orders/customerEsimUsage";
import {
  getPartnerOwnedOrderUsage,
  partnerInstallNotFoundResponse,
} from "@/app/lib/partner/partnerOrderInstall";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

/**
 * Explicit Partner action: load eSIM status & usage.
 * Ownership verified server-side. Never returns ICCID or provider tokens.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    for (const banned of [
      "iccid",
      "imei",
      "eid",
      "tac",
      "token",
      "access",
      "lpa",
      "qrValue",
    ]) {
      if (req.nextUrl.searchParams.has(banned)) {
        return partnerInstallNotFoundResponse();
      }
    }

    const session = await auth();
    const sessionUserId = session?.user?.id?.trim() || "";
    const sessionRole = session?.user?.role;
    if (!sessionUserId || sessionRole !== "PARTNER") {
      return partnerInstallNotFoundResponse();
    }

    const { orderId } = await context.params;
    const result = await getPartnerOwnedOrderUsage(sessionUserId, orderId);
    if (!result.ok) {
      const pub = customerUsagePublicError(result.code);
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
    console.error("Partner usage route error");
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404, headers: NO_STORE }
    );
  }
}
