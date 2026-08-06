import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { revealIccidForCustomer } from "@/app/lib/orders/iccidReveal";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
} as const;

function json(
  body: Record<string, unknown>,
  status: number
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Owning CUSTOMER ICCID reveal.
 * Authorization uses the session user id only — never a browser-supplied user id.
 * Unauthorized / non-owner responses are generic 404s.
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const session = await auth();
    const sessionUserId = session?.user?.id?.trim();
    const sessionRole = session?.user?.role;
    if (!sessionUserId || sessionRole !== "CUSTOMER") {
      return json({ success: false, error: "Not found" }, 404);
    }

    const { orderId } = await context.params;
    const result = await revealIccidForCustomer(sessionUserId, orderId);

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
    console.error("Customer ICCID reveal failed");
    return json({ success: false, error: "Not found" }, 404);
  }
}
