import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { Role } from "@prisma/client";
import { revealIccidForAdmin } from "@/app/lib/orders/iccidReveal";

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
 * Privileged ADMIN ICCID reveal. Decrypts only after active-admin checks.
 * Never accepts a browser-supplied admin/user id for authorization.
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
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

    const { orderId } = await context.params;
    const result = await revealIccidForAdmin(admin.id, orderId);

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
    console.error("Admin ICCID reveal failed");
    return json({ success: false, error: "Not found" }, 404);
  }
}
