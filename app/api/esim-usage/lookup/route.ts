import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth/session";
import { getRequestIpKey } from "@/app/lib/auth/requestMeta";
import {
  homeUsagePublicError,
  lookupHomeEsimUsage,
} from "@/app/lib/esim/homeUsageLookup";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

/**
 * Public / guest eSIM usage lookup by Order ID or ICCID.
 * Never returns ICCID or install secrets.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      query?: unknown;
    } | null;
    const query = typeof body?.query === "string" ? body.query : "";

    const [ipKey, sessionUser] = await Promise.all([
      getRequestIpKey(),
      getSessionUser().catch(() => null),
    ]);

    const result = await lookupHomeEsimUsage({
      query,
      ipKey,
      loggedInUserId:
        sessionUser?.role === "CUSTOMER" ? sessionUser.id : null,
    });

    if (!result.ok) {
      const pub = homeUsagePublicError(result.code);
      const headers: Record<string, string> = { ...NO_STORE };
      if (result.code === "RATE_LIMITED" && result.retryAfterSec) {
        headers["Retry-After"] = String(result.retryAfterSec);
      }
      return NextResponse.json(
        { success: false, error: result.message || pub.message },
        { status: pub.status, headers }
      );
    }

    return NextResponse.json(
      { success: true, card: result.card },
      { status: 200, headers: NO_STORE }
    );
  } catch {
    console.error("home_esim_usage_lookup_failed");
    return NextResponse.json(
      {
        success: false,
        error: "Usage is temporarily unavailable. Please try again later.",
      },
      { status: 503, headers: NO_STORE }
    );
  }
}
