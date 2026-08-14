import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { Role } from "@prisma/client";
import {
  adminUsagePublicError,
  getAdminOrderUsage,
} from "@/app/lib/orders/adminEsimUsage";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

function json(
  body: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE, ...extraHeaders },
  });
}

/**
 * Admin-only on-demand live eSIM usage.
 * Never returns ICCID, tokens, or provider secrets.
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
        return json({ success: false, error: "Not found" }, 404);
      }
    }

    const session = await auth();
    const sessionUserId = session?.user?.id?.trim();
    const sessionRole = session?.user?.role;
    if (!sessionUserId || sessionRole !== "ADMIN") {
      return json({ success: false, error: "Not found" }, 404);
    }

    const admin = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true, role: true, deletedAt: true },
    });
    if (!admin || admin.deletedAt || admin.role !== Role.ADMIN) {
      return json({ success: false, error: "Not found" }, 404);
    }

    const { orderId } = await context.params;
    const result = await getAdminOrderUsage(orderId);
    if (!result.ok) {
      const pub = adminUsagePublicError(result.code);
      const extra: Record<string, string> = {};
      if (result.code === "RATE_LIMITED" && result.retryAfterSec) {
        extra["Retry-After"] = String(result.retryAfterSec);
      }
      return json(
        {
          success: false,
          error: pub.message,
          code: result.code,
        },
        pub.status,
        extra
      );
    }

    const u = result.usage;
    return json(
      {
        success: true,
        checkedAt: result.checkedAt,
        usage: {
          status: u.status,
          statusLabel: u.statusLabel,
          initialDataGB: u.initialDataGB,
          remainingDataGB: u.remainingDataGB,
          usedDataGB: u.usedDataGB,
          usagePercent: u.usagePercent,
          isUnlimited: u.isUnlimited,
          reportsDataAllowance: u.reportsDataAllowance,
          activatedAt: u.activatedAt,
          expiresAt: u.expiresAt,
        },
      },
      200
    );
  } catch {
    console.error("Admin usage route error");
    return json(
      {
        success: false,
        error: "Live usage is temporarily unavailable. Please try again later.",
        code: "TEMPORARY_ERROR",
      },
      503
    );
  }
}
