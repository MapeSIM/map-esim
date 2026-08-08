import { NextRequest, NextResponse } from "next/server";
import {
  customerUsagePublicError,
  getCustomerOwnedOrderUsage,
} from "@/app/lib/orders/customerEsimUsage";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

/**
 * Explicit customer action: load eSIM status & usage.
 * Ownership verified server-side. Never returns ICCID or provider tokens.
 * Never logs ICCID, tokens, or provider secrets.
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
        return NextResponse.json(
          { success: false, error: "Not found" },
          { status: 404, headers: NO_STORE }
        );
      }
    }

    const { orderId } = await context.params;
    const result = await getCustomerOwnedOrderUsage(orderId);
    if (!result.ok) {
      const pub = customerUsagePublicError(result.code);
      return NextResponse.json(
        { success: false, error: pub.message },
        { status: pub.status, headers: NO_STORE }
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
    console.error("Customer usage route error");
    return NextResponse.json(
      {
        success: false,
        error: "Usage is temporarily unavailable. Please try again later.",
      },
      { status: 503, headers: NO_STORE }
    );
  }
}
