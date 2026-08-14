import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { Role } from "@prisma/client";
import {
  fetchProviderWalletSnapshot,
  providerWalletPublicError,
} from "@/app/lib/vesim/providerWallet";

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
 * Admin-only explicit refresh of read-only VeSIM provider wallet.
 * Never mutates balance. Never returns tokens/secrets.
 */
export async function GET() {
  try {
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

    const result = await fetchProviderWalletSnapshot();
    if (!result.ok) {
      const pub = providerWalletPublicError(result.code);
      const extra: Record<string, string> = {};
      if (result.code === "RATE_LIMITED" && result.retryAfterSec) {
        extra["Retry-After"] = String(result.retryAfterSec);
      }
      return json(
        {
          success: false,
          error: pub.message,
          code: result.code,
          statusLabel: "TEMPORARILY UNAVAILABLE",
        },
        pub.status,
        extra
      );
    }

    const s = result.snapshot;
    return json(
      {
        success: true,
        statusLabel: "VERIFIED",
        checkedAt: s.checkedAt,
        balance: s.balance.balance,
        currency: s.balance.currency,
        discountPercent: s.balance.discountPercent,
        transactions: s.transactions,
      },
      200
    );
  } catch {
    console.error("Admin provider wallet route error");
    return json(
      {
        success: false,
        error:
          "Provider wallet is temporarily unavailable. Please try again later.",
        code: "TEMPORARY_ERROR",
        statusLabel: "TEMPORARILY UNAVAILABLE",
      },
      503
    );
  }
}
