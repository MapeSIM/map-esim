import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { Role } from "@prisma/client";
import { syncAdminOrderIccidFromProvider } from "@/app/lib/admin/adminOrderIccidSync";
import { revealIccidForAdmin } from "@/app/lib/orders/iccidReveal";
import { apiActorHasAdminPermission } from "@/app/lib/admin/adminPermissionAccess";

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
 * Privileged ADMIN ICCID reveal / provider sync.
 * Body `{ "sync": true }` (or `?sync=1`) fetches from VeSIM and fill-once
 * captures when the Order row is still missing an ICCID.
 */
export async function POST(
  req: NextRequest,
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
      select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
    });
    if (
      !admin ||
      admin.deletedAt ||
      admin.role !== Role.ADMIN ||
      admin.adminDisabledAt
    ) {
      return json({ success: false, error: "Not found" }, 404);
    }
    if (
      !(await apiActorHasAdminPermission(admin.id, [
        "ESIM_FULFILLMENT",
        "ORDERS_MANAGE",
      ]))
    ) {
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
      const synced = await syncAdminOrderIccidFromProvider(admin.id, orderId);
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
