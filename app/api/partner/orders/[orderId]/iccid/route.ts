import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { revealIccidForPartner } from "@/app/lib/orders/iccidReveal";
import { syncPartnerOrderIccidFromProvider } from "@/app/lib/partner/partnerOrderInstall";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

function json(
  body: Record<string, unknown>,
  status: number
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Owning PARTNER ICCID reveal / provider sync.
 * Authorization uses the session user id only — never a browser-supplied user id.
 * Unauthorized / non-owner responses are generic 404s.
 * Never accepts ICCID in the query string.
 *
 * Body `{ "sync": true }` (or `?sync=1`) fetches from VeSIM and fill-once
 * captures when the Order row is still missing an ICCID.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    for (const banned of ["iccid", "lpa", "activationCode", "smdp", "token"]) {
      if (req.nextUrl.searchParams.has(banned)) {
        return json({ success: false, error: "Not found" }, 404);
      }
    }

    const session = await auth();
    const sessionUserId = session?.user?.id?.trim();
    const sessionRole = session?.user?.role;
    if (!sessionUserId || sessionRole !== "PARTNER") {
      return json({ success: false, error: "Not found" }, 404);
    }

    const { orderId } = await context.params;

    let wantSync = req.nextUrl.searchParams.get("sync") === "1";
    if (!wantSync) {
      try {
        const body = (await req.json()) as { sync?: unknown } | null;
        wantSync = body?.sync === true || body?.sync === "1";
      } catch {
        // no body — reveal-only
      }
    }

    if (wantSync) {
      const synced = await syncPartnerOrderIccidFromProvider(
        sessionUserId,
        orderId
      );
      if (synced.ok) {
        return json(
          { success: true, iccid: synced.iccid, synced: synced.synced },
          200
        );
      }
      if (synced.code === "PENDING") {
        return json(
          {
            success: false,
            error: "ICCID is not available from the provider yet.",
            code: "PENDING",
          },
          404
        );
      }
      if (synced.code === "RATE_LIMITED") {
        return json(
          {
            success: false,
            error: "Please wait a moment before refreshing again.",
            code: "RATE_LIMITED",
          },
          429
        );
      }
      if (synced.code === "UNAVAILABLE") {
        return json(
          {
            success: false,
            error: "ICCID is temporarily unavailable.",
            code: "UNAVAILABLE",
          },
          503
        );
      }
      return json({ success: false, error: "Not found" }, 404);
    }

    const result = await revealIccidForPartner(sessionUserId, orderId);

    if (!result.ok) {
      if (result.code === "PENDING") {
        return json(
          {
            success: false,
            error: "ICCID is not available yet.",
            code: "PENDING",
          },
          404
        );
      }
      if (result.code === "UNAVAILABLE") {
        return json(
          {
            success: false,
            error: "ICCID is temporarily unavailable.",
            code: "UNAVAILABLE",
          },
          503
        );
      }
      return json({ success: false, error: "Not found" }, 404);
    }

    return json({ success: true, iccid: result.iccid }, 200);
  } catch {
    console.error("Partner ICCID reveal failed");
    return json({ success: false, error: "Not found" }, 404);
  }
}
